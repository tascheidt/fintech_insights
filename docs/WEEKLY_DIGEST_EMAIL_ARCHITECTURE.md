# Weekly Digest Email Architecture

**Document Purpose:** Current-state technical overview of the shared weekly digest model, persistence layer, and email delivery flow.

**Last Updated:** 2026-07-15

---

## Executive Summary

The weekly digest is now built as a shared hiring brief for both email and in-app views.

The key editorial rule is:
- describe what roles companies are hiring for
- distinguish ongoing hiring patterns from genuinely new signals
- use simple, objective language

The digest no longer treats tech-stack commentary as a primary output. The main content is role-focused and continuity-aware.

**Editorial v2 (Jul 2026).** A review of six consecutive issues found the output template-written: the same three-beat sentence skeleton in every company entry ("continues hiring" appeared 79 times across six issues), a near-identical deterministic lede five weeks out of six, the "New This Week" section duplicating company-section prose verbatim, and no memory between issues. v2 changes: an editorial company-summary prompt with anti-template rules and a signal-proportional length rule; serial memory (`{previous_weeks}`) so entries can make earned streak claims; an AI-written lede (Flash, ungrounded, telemetered) with the deterministic builder as fallback; a `new_signal` field so the renamed **Signals** section carries one signal-specific sentence instead of duplicating the body; and an optional **What we're watching** closer.

---

## End-to-End Flow

1. Vercel cron calls `GET /api/cron/report`.
2. `web/app/api/cron/report/route.ts` creates a `job_runs` record.
3. `web/lib/analysis/digest.ts` loads the prior complete week of job postings.
4. The digest generator builds company-level evidence bundles:
   - weekly roles
   - current open roles
   - year-to-date hiring context
   - weekly role themes
   - continuity vs. new-signal assessment
5. Gemini generates company summaries using the active `weekly_digest_ai` runtime config.
6. A deterministic global summary and cross-company role trends are assembled from the shared model.
7. The digest is stored in `weekly_digests` and `weekly_digest_companies`.
8. Opted-in users are loaded from `profiles`, emails are sent via Resend batch API, and deliveries are recorded in `weekly_digest_deliveries`.

---

## Core Files

- `web/app/api/cron/report/route.ts`
  Orchestrates digest generation, persistence, email delivery, and delivery tracking.

- `web/lib/analysis/digest.ts`
  Builds the weekly digest model, historical role context, company commentary prompts, and global summary.
  Also defines `DigestData` (alias of `WeeklyDigest`) and `DigestRendererProps` — the shared handoff contract for renderers.

- `web/components/digests/digest-render-helpers.ts`
  Shared, primitive-free data-shaping module consumed by both renderers. Owns
  slug lookups, date-range / year-label formatting, leading-theme resolution,
  and surface-aware link building (industry trends, strategy signals,
  company-section view-models). See "Renderer Architecture" below.

- `web/lib/email/templates/weekly-digest.tsx`
  Renders the email version of the shared digest model. Thin wrapper around
  the shared helpers — owns only `@react-email/components` primitives + inline
  styles.

- `web/components/digests/DigestViewer.tsx`
  Renders the in-app version of the shared digest model. Thin wrapper around
  the shared helpers — owns only Tailwind / shadcn primitives + Next `<Link>`.

- `web/lib/ai/prompt-config.ts`
  Stores default/runtime prompt config, including the `weekly-digest` Prompt Forge stage.

---

## Renderer Architecture

The two digest surfaces — in-app viewer and Resend email — render the same
`WeeklyDigest` payload but cannot literally share JSX:

- **Different primitives.** The viewer uses Tailwind `<div>`s + shadcn `<Card>`
  + Next `<Link>`; the email uses `@react-email/components` (`<Section>`,
  `<Heading>`, `<Text>`, `<Link>`) with inline-style objects.
- **Different link semantics.** The viewer emits relative paths for Next
  client-side navigation; the email emits absolute URLs with UTM parameters.

So the dedupe boundary is **data shaping, not markup**. The shared module at
`web/components/digests/digest-render-helpers.ts` owns:

- `findCompanySlug` — resolve a display name back to a slug
- `formatDateRange`, `getYearStartIso`, `getYearLabel`
- `getLeadingTheme`, `getLeadingThemeId`
- `makeLinkBuilder` / `buildDigestTopLinks` — surface-aware link builders
  (relative for `app`, absolute + UTM for `email`)
- `buildIndustryTrendRows` — pre-resolved view-model for the
  "Role Focus This Week" table (theme href + per-company badge hrefs)
- `buildStrategySignalRows` — pre-resolved view-model for "New This Week"
- `buildCompanySectionView(s)` — pre-resolved view-model for "Company
  Highlights" (slug, primary-focus theme, hrefs, continuity copy data,
  inline-theme chips for "New this week: X, Y, Z.")

Each renderer imports the helpers, builds the view-models, then maps them
onto its own primitives. The helpers file is **primitive-free** — no `react`,
no `next/link`, no `@react-email/components` imports. Adding a third surface
later (e.g. Slack, MJML) only requires another thin wrapper.

The shared handoff types (`DigestData`, `DigestRendererProps`,
`SurfaceContext`) live in `web/lib/analysis/digest.ts` and
`digest-render-helpers.ts`. When changing the renderer contract, update both
files in the same PR.

---

## Shared Digest Model

### Weekly digest

`WeeklyDigest` contains:
- week range
- total jobs
- total companies
- `global_summary`
- `industry_trends`
- `strategy_signals`
- company summaries

### Company summary

Each company summary now persists:
- `headline`
- `body`
- `new_job_count`
- `current_open_job_count`
- `year_to_date_job_count`
- `weekly_role_themes`
- `open_role_themes`
- `year_to_date_role_themes`
- `continuity`
- `continuing_themes`
- `new_themes`

This allows the email and in-app UI to present the same factual role-based narrative.

---

## Prompting Approach

### Runtime config

The weekly digest company summary prompt is now a Prompt Forge stage:
- stage key: `weekly-digest`
- system settings key: `weekly_digest_ai`

### Prompt goals (editorial v2)

The company-summary prompt is tuned to:
- lead with the most interesting specific fact, quoting 1–2 real job titles when they carry the story
- spend words where the signal is: a quiet week gets one plain sentence, a real signal gets 2–4
- use the `{previous_weeks}` serial-memory block for earned streak claims ("third straight week of…") and to avoid repeating recent sentence shapes
- return a third field, `new_signal` — one sentence naming only the genuinely new thing — used by the "Signals" section so it never duplicates the body
- ban the v1 template skeletons ("This activity continues…", "established year-to-date pattern", telemetry diction like "no new trends were detected")
- avoid hype, slang, and inflated strategy language (voice directive still applies)

The default runs at temperature 0.4 (up from 0.2) because sentence-structure variety is an explicit goal.

### Serial memory

`getPreviousDigestContext` (in `digest.ts`) loads the last 4 stored digests' per-company rows (headline, counts, new themes) plus their global-summary headlines. Per-company notes feed `{previous_weeks}`; the recent lede headlines feed the global-summary call as an anti-repetition list. The lookup is failure-safe: any error yields empty context, never a failed digest.

### Global summary (AI lede with deterministic fallback)

`generateGlobalSummaryCommentary` writes the issue lede from the already-generated company entries + cross-company trends: `headline`, `key_insight`, `body`, and an optional forward-looking `watching` line rendered as "What we're watching". One ungrounded Flash call, telemetered to `gemini_usage_events` (`callSite: generateDigestGlobalSummary`). On any failure it returns null and `buildGlobalSummary` (the deterministic v1 builder) supplies the fallback — the digest never fails because the lede call did.

### Scope note

Prompt Forge covers the company-level summaries (`weekly-digest` stage). Note the `{previous_weeks}` placeholder is **required**: a stored `weekly_digest_ai` config that lacks it fails placeholder validation at load time and the code falls back to the editorial-v2 default template.

---

## Persistence Layer

### `weekly_digests`

Stores digest-level metadata and cross-company sections:
- `global_summary`
- `industry_trends`
- `strategy_signals`
- `notable_movements`

### `weekly_digest_companies`

Stores company-level digest content plus the continuity-aware role model used by both surfaces.

### `weekly_digest_deliveries`

Tracks per-user email delivery state for a digest.

---

## Email Delivery

### Recipient selection

Users are loaded from `profiles`.

`email_preferences.weekly_digest` is opt-out:
- `null` means enabled
- `true` means enabled
- `false` means disabled

### Delivery method

Emails are sent through Resend batch API in chunks of up to 100 recipients.

### Failure handling

- The digest is saved before email delivery starts.
- Email failure does not discard the digest.
- Individual batch failures are recorded in `weekly_digest_deliveries`.

---

## Current Editorial Output

### Company sections

Each company section should answer:
1. What roles are open this week?
2. Is this a continuation of what the company has already been hiring for?
3. If there is a genuinely new signal, what is it?

### Cross-company sections

- `Role Focus This Week` summarizes role themes that appeared across multiple companies.
- `Signals` (formerly `New This Week`) is reserved for higher-confidence changes in role focus. It renders headline + the one-sentence `new_signal` (falling back to `body` for pre-v2 stored digests), so prose is never duplicated between it and the company sections.
- `What we're watching` is an optional forward-looking closer from the AI lede.

---

## Operational Notes

- The digest uses the prior complete Monday-Sunday week when `getWeeklyData(7)` is called from the cron route.
- Prompt Forge can now evaluate and save weekly digest company-summary prompts without editing source code.
- If the digest starts overclaiming novelty again, review:
  - `weekly_role_themes`
  - `year_to_date_role_themes`
  - `continuity`
  - the active `weekly_digest_ai` prompt config

---

## Verification Checklist

- `cd web && npm run lint`
- `cd web && npm run build`
- Spot-check one generated digest where the correct answer is “this continues an existing pattern”
- Spot-check one digest where there is a legitimate new role signal
