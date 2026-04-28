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

**Two Vercel crons (collect, report) + three GH Actions crons (company-insights, editorial, gemini-cost-alarm).** Hard cap: never more than two Vercel crons. Most GH Actions crons `curl` back into the deployed app with `Bearer ${CRON_SECRET}`; the editorial cron runs the regenerate script directly in the runner.

- Vercel daily 6 AM UTC: `/api/cron/collect` — collects jobs and triggers analysis.
- Vercel weekly Mon 5 AM UTC: `/api/cron/report` — generates the weekly digest.
- GitHub Actions weekly Mon 9 AM UTC: `company-insights-cron.yml` — scheduled company-insight regeneration.
- GitHub Actions weekly Mon 11 AM UTC: `editorial-cron.yml` — runs `web/scripts/regenerate-editorial.ts` against stale companies (`companies.thesis / interpretation / bets`) and refreshes cross-company theme labels.
- GitHub Actions daily 14:00 UTC: `gemini-cost-alarm.yml` — sums last 24h `gemini_usage_events.estimated_usd` and fires `Sentry.captureMessage` over threshold.

Heavy browser scraping is offloaded to GitHub Actions on demand via `triggerScrapeWorkflow` in `web/lib/github.ts` (`scrape-heavy.yml`). Full topology, secrets, and decision tree in [`docs/CRON_TOPOLOGY.md`](./docs/CRON_TOPOLOGY.md).

All scheduled jobs MUST log into the `job_runs` table. `cron_logs` is deprecated — never reference it. See section 7.

## 5. AI model rules

Compact rules; long-form rationale + April 2026 cost-incident context in [`docs/AI_HYGIENE.md`](./docs/AI_HYGIENE.md).

- **Always use floating `-latest` aliases.** Never pin a versioned or preview model ID. The comparison harness (`web/scripts/gemini-compare.ts`) and `gemini_usage_events` telemetry are how we catch a bad alias rotation.
- **Approved models:** `gemini-pro-latest` (grounded analysis), `gemini-flash-latest` (default), `gemini-flash-lite-latest` (high-volume low-stakes only, gated by ≥95% L1 field agreement in the harness report).
- **All model strings resolve through `AI_MODEL_OPTIONS` in `web/lib/ai/prompt-config.ts`.** No hardcoded strings elsewhere.
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

## 7. Conventions

- **Zod errors:** `result.error.issues`, never `.errors`. Vercel's TS is strict; local lint may not catch it.
- **Logging:** `log.*` from `@/lib/log` in API routes. Avoid raw `console.*`.
- **Job tracking:** every scheduled or manual job row goes in `job_runs`. Valid `job_type`: `collect` | `analyze` | `report` | `company-insights` | `insight-generation`. Valid `status`: `pending` | `running` | `completed` | `failed` | `cancelled`. Never reference the deprecated `cron_logs` table.
- **Auth:** import guards from `web/lib/auth/guards.ts`. Don't reinvent.
- **Build before push:** `cd web && npm run build` is the contract. Vercel will fail the deploy on a TS error that local dev tolerates.
- **Changelog discipline:** every user-facing change gets an entry in `web/data/releases.json`. Types: `feature` | `fix` | `improvement`. Bump `web/package.json` version per semver: patch (1.0.x) bug fixes, minor (1.x.0) features, major (x.0.0) breaking changes.
- **Tests:** Vitest for unit (pure functions only), Playwright for one smoke (`e2e/smoke.spec.ts`); see `docs/AGENTS.md`#Tests.

## 8. Anti-patterns

Things that will get a PR rejected:

- Adding a third Vercel cron. The cap is two — route long-running work through GitHub Actions instead.
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
