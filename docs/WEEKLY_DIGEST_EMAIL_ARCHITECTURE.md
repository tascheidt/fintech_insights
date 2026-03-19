# Weekly Digest Email Architecture

**Document Purpose:** Current-state technical overview of the shared weekly digest model, persistence layer, and email delivery flow.

**Last Updated:** 2026-03-10

---

## Executive Summary

The weekly digest is now built as a shared hiring brief for both email and in-app views.

The key editorial rule is:
- describe what roles companies are hiring for
- distinguish ongoing hiring patterns from genuinely new signals
- use simple, objective language

The digest no longer treats tech-stack commentary as a primary output. The main content is role-focused and continuity-aware.

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

- `web/lib/email/templates/weekly-digest.tsx`
  Renders the email version of the shared digest model.

- `web/components/digests/DigestViewer.tsx`
  Renders the in-app version of the shared digest model.

- `web/lib/ai/prompt-config.ts`
  Stores default/runtime prompt config, including the `weekly-digest` Prompt Forge stage.

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

### Prompt goals

The prompt is tuned to:
- state what roles are open
- say whether the week continues an existing pattern or shows a change
- mention a new insight only when supported by the roles
- avoid hype, slang, and inflated strategy language

### Scope note

Prompt tuning currently covers company-level digest summaries. The global summary is assembled deterministically from the shared digest model to keep the top-level narrative more objective and stable.

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
- `New This Week` is reserved for higher-confidence changes in role focus.

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
