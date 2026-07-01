# CLAUDE.md

Guidance for Claude Code (and any other coding agent) working in this repo. Keep this file scannable. Long-form content lives in `docs/` and per-area sub-CLAUDE files; this is the index.

## 1. Project overview

The Fintech Talent Brief is a hiring-intelligence platform tracking job postings from fintech companies. Two components:
- **Python CLI backend** (`/src`) — scraping, analysis, reporting via `./run.sh`.
- **Next.js web app** (`/web`) — dashboard hosted on Vercel; this is where almost all active development happens.

Aesthetic: Notion-style. Clean white / very subtle off-white theme, high-contrast typography. A refined dark theme is acceptable when strictly required.

## 2. Tech stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui, TanStack Query.
- **Backend:** Python 3 + Click CLI, SQLAlchemy 2.0, BeautifulSoup4 (legacy CLI flow).
- **Database:** Supabase (PostgreSQL) with RLS.
- **Auth:** Supabase SSR with Google OAuth. Per-area rules in [`web/lib/auth/CLAUDE.md`](./web/lib/auth/CLAUDE.md).
- **AI:** Google Gemini via floating `-latest` aliases. See section 5.
- **Email:** Resend API. Digest architecture in [`docs/WEEKLY_DIGEST_EMAIL_ARCHITECTURE.md`](./docs/WEEKLY_DIGEST_EMAIL_ARCHITECTURE.md).
- **Scraping:** Puppeteer Core (serverless) + BeautifulSoup4. See [`web/lib/scrapers/CLAUDE.md`](./web/lib/scrapers/CLAUDE.md).
- **TS path alias:** `@/*` → `/web/*`.

### Common commands

```bash
# Web (Next.js)
cd web
npm run dev      # dev server on :3000
npm run build    # production build (run before pushing — Vercel TS is strict)
npm run lint

# Python CLI
./run.sh init
./run.sh collect --analyze
./run.sh report --preview

# DB scripts
npx tsx web/scripts/run-migration.ts
npx tsx web/scripts/verify-migration.ts
```

## 3. Active pipelines

The live per-job hot path after `collect` runs:

```
processor.ts  → [description_hash gate] → extractAndUpdateStructure → extractJobStructure (Flash)
analyzer.ts   → analyzeJobAdvanced (Pro + grounded; in-flight grounding, no pre-fetch)
```

Two AI calls per job. `analyzeJob` (in `web/lib/analysis/strategic.ts`) and `categorizePosting` (in `web/lib/analysis/categorizer.ts`) are **not** on this path — they're for backfill. Full details in [`docs/INGESTION_PIPELINE.md`](./docs/INGESTION_PIPELINE.md).

## 4. Cron topology

**Two Vercel crons (collect, report) + four GH Actions crons (company-insights, editorial, gemini-cost-alarm, embeddings-backfill).** Hard cap: never more than two Vercel crons. Most GH Actions crons `curl` back into the deployed app with `Bearer ${CRON_SECRET}`; the editorial and embeddings-backfill crons run their script directly in the runner.

- Vercel daily 6 AM UTC: `/api/cron/collect` — collects jobs and triggers analysis.
- Vercel weekly Mon 5 AM UTC: `/api/cron/report` — generates the weekly digest.
- GitHub Actions weekly Mon 9 AM UTC: `company-insights-cron.yml` — scheduled company-insight regeneration.
- GitHub Actions weekly Mon 11 AM UTC: `editorial-cron.yml` — runs `web/scripts/regenerate-editorial.ts` against stale companies (`companies.thesis / interpretation / bets`) and refreshes cross-company theme labels.
- GitHub Actions daily 14:00 UTC: `gemini-cost-alarm.yml` — reads last 24h `gemini_usage_events` and fires `Sentry.captureMessage` on any of three tripwires (calibrated USD / grounded-call count / token volume; `estimated_usd` alone under-counts grounding ~2.7x). Tripwire math in `web/lib/ai/cost-alarm-eval.ts`.
- GitHub Actions daily 07:30 UTC: `embeddings-backfill-cron.yml` — runs `web/scripts/backfill-job-embeddings.ts` to (re-)embed job rows with a null/stale `embedding` for Jobs semantic search. Decoupled from the ingest hot path on purpose.

Heavy browser scraping is offloaded to GitHub Actions on demand via `triggerScrapeWorkflow` in `web/lib/github.ts` (`scrape-heavy.yml`). Full topology, secrets, and decision tree in [`docs/CRON_TOPOLOGY.md`](./docs/CRON_TOPOLOGY.md).

**Incumbent-tracking flag.** `collect`, `report` (Incumbent Watch), the `editorial` cron, and `backfill-incumbents.ts` all honor the `incumbent_tracking_enabled` flag (see §7). When it's off (the default), `collect` excludes `tier='incumbent'` companies at company-selection time — so incumbents are never scraped, extracted, or analyzed — and the digest's Incumbent Watch block is skipped. The flag is read via `getIncumbentTrackingEnabled` in `web/lib/settings/incumbent-tracking.ts`.

All scheduled jobs MUST log into the `job_runs` table. `cron_logs` is deprecated — never reference it. See section 7.

## 5. AI model rules

Compact rules; long-form rationale + April 2026 cost-incident context in [`docs/AI_HYGIENE.md`](./docs/AI_HYGIENE.md).

- **Always use floating `-latest` aliases.** Never pin a versioned or preview model ID. The comparison harness (`web/scripts/gemini-compare.ts`) and `gemini_usage_events` telemetry are how we catch a bad alias rotation.
- **Approved models:** `gemini-pro-latest` (grounded analysis), `gemini-flash-latest` (default), `gemini-flash-lite-latest` (high-volume low-stakes only, gated by ≥95% L1 field agreement in the harness report).
- **Embeddings are the one pinned exception.** Google publishes no `-latest` alias for embedding models, so Jobs semantic search pins `gemini-embedding-001` (768d) via `EMBEDDING_MODEL` / `EMBEDDING_DIMS` in `prompt-config.ts` — still the single source of truth, just not a floating alias. Every embedded row stamps `embedding_model` + `embedding_dims`; changing the model REQUIRES a re-embed (the backfill detects the mismatch). Comparing vectors across models is silently wrong.
- **All model strings resolve through `AI_MODEL_OPTIONS` (and `EMBEDDING_MODEL`) in `web/lib/ai/prompt-config.ts`.** No hardcoded strings elsewhere. The one documented exception is the **eval-only** open-model registry (`web/lib/ai/providers/registry.ts`): the open-weight bake-off candidates (Qwen3-30B-A3B / Llama 4 Scout / Mistral Small / DeepSeek V4-Flash; GLM-5.2 retired after Round 1) are kept out of `AI_MODEL_OPTIONS` on purpose so the admin UI never exposes an unvetted model. It's a bake-off seam only — `resolveProvider` returns `"gemini"` for everything else, so production is unchanged. See [`docs/OPEN_MODEL_EVALUATION.md`](./docs/OPEN_MODEL_EVALUATION.md).
- **Every Gemini call writes to `gemini_usage_events`** via `writeUsageEvent` from `@/lib/ai/gemini-telemetry` (build the record with `recordUsage` from `@/lib/ai/gemini-meter`). Fire-and-forget; errors are swallowed.
- **PRs touching `web/lib/ai/**` or `web/lib/analysis/**` MUST run `gemini-compare.ts`** and attach the markdown report; commit JSON artifacts under `web/scripts/artifacts/`.
- **Don't stack grounded calls.** Before adding a new `googleSearch` call, check whether an upstream call already grounds.
- **Cache keys must include `prompt_config_version`** or prompt tweaks silently serve stale outputs.
- **Editorial voice** (`web/lib/ai/voice.ts`, rules in [`docs/voice.md`](./docs/voice.md)) is mandatory on user-facing surfaces (digest, company insight, **company editorial**, **cross-company theme labels**, chat, narrative) and forbidden on internal extraction/classification.
- **Reuse upstream research before adding grounded calls.** The company editorial engine (`web/lib/analysis/company-editorial.ts`) is ungrounded; it loads the most recent `company_insights` row and feeds it as background context. Don't add a third grounded call just because a new surface needs background.

## 6. Directory map

| Where | What |
|---|---|
| `web/app/(dashboard)/` | Server-component dashboard pages. |
| `web/app/api/` | API routes; cron handlers under `web/app/api/cron/`. |
| `web/lib/ai/` | Gemini infrastructure (prompt-config, meter, telemetry, voice). See sub-CLAUDE. |
| `web/lib/analysis/` | AI analysis modules (extract, analyze, digest, company insights). See sub-CLAUDE. |
| `web/lib/scrapers/` | ATS scrapers (API + browser). See sub-CLAUDE. |
| `web/lib/auth/` | Auth guards used by API routes. See sub-CLAUDE. |
| `web/lib/jobs/` | Ingestion processor + analyzer (orchestrates the hot path). |
| `web/lib/settings/` | DB-backed feature flags read from `system_settings` (e.g. `incumbent-tracking.ts`). |
| `web/lib/dashboard-queries.ts` | Supabase query layer for dashboard. |
| `web/components/{feature}/` | Feature components. |
| `web/components/ui/` | shadcn/ui primitives. |
| `web/components/README.md` | Design system entry point — read before touching UI. |
| `web/components/DESIGN_SYSTEM.md` | Token + component reference (light + dark, chip system, alignment). |
| `web/app/globals.css` | Single source of truth for all design tokens (colors, type, gradients). |
| `web/eslint-rules/no-raw-color.js` | Lints raw hex/rgb/oklch literals outside `globals.css`. |
| `web/scripts/` | Operational scripts (migrations, gemini-compare, regenerate-insights). |
| `web/data/releases.json` | Changelog. |
| `web/supabase/migrations/` | DB migrations. |
| `src/scrapers/` | Legacy Python CLI scrapers. |
| `config/companies.yaml` | Company configs (`name`, `slug`, `country`, `ats_type`, `ats_identifier`). |
| `docs/` | Long-form architecture docs. Start with `docs/AGENTS.md`. |
| `.claude/agents/` | Project subagent definitions (`senior-architect`, `senior-staff-code-reviewer`, `ux-design-advisor`). Committed; treat edits as code changes. |
| `web/.claude/agent-memory/` | Per-agent learned memory. Local-only; gitignored. |

## 7. Conventions

- **Zod errors:** `result.error.issues`, never `.errors`. Vercel's TS is strict; local lint may not catch it.
- **Logging:** `log.*` from `@/lib/log` in API routes. Avoid raw `console.*`.
- **Job tracking:** every scheduled or manual job row goes in `job_runs`. Valid `job_type`: `collect` | `analyze` | `report` | `company-insights` | `insight-generation`. Valid `status`: `pending` | `running` | `completed` | `failed` | `cancelled`. Never reference the deprecated `cron_logs` table.
- **Job-run retention:** `job_run_tasks.scraped_data` (the full ATS corpus snapshot, 12–17 MB per big-bank run) is **intentionally transient** — it exists only for a same-run `startFromStage:'ingest'` resume (25-min window). The daily collect cron runs `pruneJobRunRetention` (`web/lib/jobs/retention.ts`) to null snapshots >2 days old and delete `job_runs` >90 days old. Don't add code that relies on `scraped_data` surviving long-term, and don't treat `job_run_tasks` / `job_runs` as a permanent archive. (Letting `scraped_data` accumulate put the DB at 224% of the free-tier quota — June 2026.)
- **Auth:** import guards from `web/lib/auth/guards.ts`. Don't reinvent.
- **Build before push:** `cd web && npm run build` is the contract. Vercel will fail the deploy on a TS error that local dev tolerates.
- **Changelog discipline:** every user-facing change gets an entry in `web/data/releases.json`. Types: `feature` | `fix` | `improvement`. Bump `web/package.json` version per semver: patch (1.0.x) bug fixes, minor (1.x.0) features, major (x.0.0) breaking changes.
- **Tests:** Vitest for unit (pure functions only), Playwright for one smoke (`e2e/smoke.spec.ts`); see `docs/AGENTS.md`#Tests.
- **Vercel webhook hiccup recipe:** if a merge to `main` shows GitHub status `Vercel - Deployment failed.` with **no** target URL and **no** entry in Vercel's Deployments tab, the webhook was rejected upstream of any build — there's no log to read because no build happened. Push an empty commit to retrigger: `git commit --allow-empty -m "chore: retrigger Vercel" && git push origin main`. Don't chase a phantom build error; verify a deployment record exists before debugging code.
- **Company-active read scoping:** two independent `is_active` axes exist and MUST NOT be conflated — `companies.is_active` (do we track this company at all / soft-delete) vs `job_postings.is_active` (is this specific req still open). Deactivating a company does **not** cascade to its postings' job-level `is_active` (that would corrupt reactivation), so filtering the job axis does not exclude a deactivated company. User-facing reads MUST go through the `active_companies` / `active_job_postings` views (migration `20260601130000`), which bake in `companies.is_active = true` and compose cleanly with the job-axis `Active/Inactive/All` toggle. Enforced by the `design-system/active-company-scope` lint rule in the read-layer (`lib/dashboard-queries.ts`, `lib/analysis/**`, `lib/ai/**`); writes stay on the base tables (the views are read-only); admin / labs / ops / route code reads the base tables by design. New SQL RPCs that surface companies/jobs must filter `c.is_active = true` (lint can't see SQL). The Monzo incident (May 2026): company deactivated, 51 job-active postings, leaked into Jobs search + dashboard aggregates.
- **Tier-/role-variant rendering:** when adding a tier or role variant of an existing page (`{isIncumbent ? <IncumbentBranch /> : <FintechBranch />}`), walk every conditional render block from the original (`{insight && ...}`, `{coreFunctions.length && ...}`) and decide explicitly: keep / drop / replace. The May 2026 incumbent-variant work loaded `latestInsight` for the page but had no code to render it, so admin-generated insights silently went nowhere.
- **Incumbent-tracking flag:** `incumbent_tracking_enabled` in `system_settings` is the **single source of truth** for whether the incumbent (big-bank) tier is live. Default **off** (fintech-only) — June 2026, to control scrape volume + AI cost. Read it through `getIncumbentTrackingEnabled` / `getIncumbentTrackingEnabledCached` (`web/lib/settings/incumbent-tracking.ts`), which default to **false** on a missing row or read error (so OFF holds before the seed migration is applied). It gates scraping (`collect`), processing (digest Incumbent Watch, `editorial` cron, `backfill-incumbents.ts`), and every incumbent UI surface (dashboard rail, Companies `incumbent` lens, Jobs tier control, `/companies/[slug]` for banks → redirects to `/companies`). Admins flip it from **Admin → Settings**. This flag is independent of `companies.is_active` — do **not** gate incumbents by deactivating the companies (that conflates the two `is_active` axes and isn't cleanly reversible); the flag preserves all data and restores every surface when flipped back on.

## 8. Anti-patterns

Things that will get a PR rejected:

- Adding a third Vercel cron. The cap is two — route long-running work through GitHub Actions instead.
- Pinning `node-version: '20'` (or older) in a `.github/workflows/*.yml` file. Node 20 is deprecated for GitHub Actions runners (forced to 24 by default starting June 2026, removed September 2026). Use `'22'` or newer.
- Hardcoding a model string outside `web/lib/ai/prompt-config.ts`.
- Hardcoding a color outside `web/app/globals.css` (raw hex, rgb, hsl, oklch, or `bg-[#…]`). Add a token instead. Lint rule: `design-system/no-raw-color`.
- Using Fraunces (`font-display`) outside the four approved editorial surfaces (digest hero, marketing hero, login hero, company stated-strategy callout).
- Using Tailwind's default green/red/yellow scales for hiring numbers or signal strength. Use `growth-500`, `sunset-*`, `accent`, `highlight` instead.
- Pinning a versioned/preview Gemini model ID (e.g. `gemini-2.0-flash`). Always `-latest`.
- Adding a Gemini call site that doesn't write to `gemini_usage_events`.
- Adding a second grounded Pro call per job (the April 2026 incident).
- Adding the voice directive to internal extraction/classification prompts (it only burns tokens; users never see the output).
- Mocking the Supabase DB in tests instead of using the test schema.
- Referencing `cron_logs` (deprecated and removed).
- Reading the base `companies` / `job_postings` tables in the read-layer (`lib/dashboard-queries.ts`, `lib/analysis/**`, `lib/ai/**`) instead of the `active_companies` / `active_job_postings` views — a deactivated company leaks in. Lint: `design-system/active-company-scope`. (See §7 "Company-active read scoping.")
- Cascading `companies.is_active` onto `job_postings.is_active` (or materializing a `company_active` column on jobs). The two axes are independent; conflating them corrupts reactivation and the job-level Active/Inactive/All toggle.
- Gitignoring `.claude/agents/` or moving agent definitions back under `web/.claude/`. Agent definitions are part of the project contract and live at the repo root.
- Touching `web/lib/scrapers/browser.ts` (1131 LOC) for a refactor before launch.
- Editing architecture/cron/AI/auth/schema without updating the relevant `.md` (see section 9).

## 9. Documentation hygiene

**Any PR that changes architecture, cron topology, AI model usage, schema, directory layout, scheduler venue, or auth/security model MUST update the relevant `.md` file in the same PR.** Reviewers reject PRs that drift from the docs.

The relevant docs include:

- Root [`CLAUDE.md`](./CLAUDE.md) (this file)
- [`docs/AGENTS.md`](./docs/AGENTS.md) — operator's manual
- Per-area sub-CLAUDEs: [`web/lib/analysis/CLAUDE.md`](./web/lib/analysis/CLAUDE.md), [`web/lib/scrapers/CLAUDE.md`](./web/lib/scrapers/CLAUDE.md), [`web/lib/ai/CLAUDE.md`](./web/lib/ai/CLAUDE.md), [`web/lib/auth/CLAUDE.md`](./web/lib/auth/CLAUDE.md)
- [`docs/CRON_TOPOLOGY.md`](./docs/CRON_TOPOLOGY.md), [`docs/AI_HYGIENE.md`](./docs/AI_HYGIENE.md), [`docs/INGESTION_PIPELINE.md`](./docs/INGESTION_PIPELINE.md), [`docs/OBSERVABILITY.md`](./docs/OBSERVABILITY.md)
- [`docs/voice.md`](./docs/voice.md), [`docs/WEEKLY_DIGEST_EMAIL_ARCHITECTURE.md`](./docs/WEEKLY_DIGEST_EMAIL_ARCHITECTURE.md)
- [`web/components/README.md`](./web/components/README.md), [`web/components/DESIGN_SYSTEM.md`](./web/components/DESIGN_SYSTEM.md) — design system docs (update on token / chip / editorial-surface changes)
- [`web/data/releases.json`](./web/data/releases.json) — user-facing changelog
- `web/.env.example` when env vars change

When you're not sure if a change requires a doc update, ask in the PR description. The PR template (`.github/pull_request_template.md`) has a checkbox for each doc area, and a non-blocking CI check (`.github/workflows/doc-drift-check.yml`) will warn on architecture-touching PRs that ship without `.md` changes.
