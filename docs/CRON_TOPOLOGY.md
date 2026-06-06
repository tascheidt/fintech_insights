# Cron Topology

Six scheduled jobs run in production. Two live on Vercel (Hobby plan caps at 2),
four run from GitHub Actions. Most GH Actions cron jobs `curl` back into the
deployed Next.js app; the editorial and embeddings-backfill crons are the
exceptions — they run a script directly inside the runner because GH Actions
has the runtime budget for the long-running Gemini work.

## Jobs

| Job                | Venue          | Schedule (UTC) | Endpoint / runtime                                    | Auth                                  |
|--------------------|----------------|----------------|-------------------------------------------------------|---------------------------------------|
| collect            | Vercel cron    | `0 6 * * *`    | `GET /api/cron/collect`                               | Vercel-injected `Bearer CRON_SECRET`  |
| report             | Vercel cron    | `0 8 * * 1`    | `GET /api/cron/report`                                | Vercel-injected `Bearer CRON_SECRET`  |
| company-insights   | GitHub Actions | `0 9 * * 1`    | `GET /api/cron/company-insights`                      | Workflow sends `Bearer CRON_SECRET`   |
| editorial          | GitHub Actions | `0 11 * * 1`   | `npx tsx web/scripts/regenerate-editorial.ts`         | Service-role + Gemini secrets in repo |
| gemini-cost-alarm  | GitHub Actions | `0 14 * * *`   | `GET /api/admin/cost-alarm`                           | Workflow sends `Bearer CRON_SECRET`   |
| embeddings-backfill| GitHub Actions | `30 7 * * *`   | `npx tsx web/scripts/backfill-job-embeddings.ts`      | Service-role + Gemini secrets in repo |

Source of truth:
- Vercel: [`web/vercel.json`](../web/vercel.json) `crons` array.
- GitHub Actions: [`.github/workflows/company-insights-cron.yml`](../.github/workflows/company-insights-cron.yml), [`.github/workflows/editorial-cron.yml`](../.github/workflows/editorial-cron.yml), [`.github/workflows/gemini-cost-alarm.yml`](../.github/workflows/gemini-cost-alarm.yml), [`.github/workflows/embeddings-backfill-cron.yml`](../.github/workflows/embeddings-backfill-cron.yml).

The embeddings-backfill cron sweeps job rows whose `embedding` is null or was
produced by a stale model and (re-)embeds them for Jobs semantic search. It is
idempotent and decoupled from the ingest hot path on purpose — an embedding-API
outage must never stall job ingestion. Same script/secret pattern as editorial.

The `report` job also generates one company insight per run as a side effect.
The GH Actions `company-insights` workflow loops one-company-per-HTTP-request
until the route reports `hasMore: false`, with a safety cap of 50 iterations
and a 60-minute job timeout. Both fintech and incumbent tiers are eligible —
incumbents used to be skipped, but the workflow now covers every active
company so newly added banks don't sit insight-less for weeks.

The `collect` cron also does inline housekeeping before it starts scraping:
(1) it marks tasks stuck in `running` past `STALE_JOB_THRESHOLD_MS` as failed,
and (2) it runs a storage-retention sweep (`pruneJobRunRetention` in
[`web/lib/jobs/retention.ts`](../web/lib/jobs/retention.ts)) that nulls
`job_run_tasks.scraped_data` snapshots older than 2 days and deletes `job_runs`
older than 90 days. The `scraped_data` snapshot (the full enriched ATS corpus,
12–17 MB per big-bank run) is only read back by a same-run `startFromStage:'ingest'`
resume; left unbounded it grew to 673 MB and pushed the DB to 224% of the
free-tier quota (June 2026). The sweep is best-effort and never aborts a collect.

## Required secrets

`CRON_SECRET` is shared between Vercel and GH Actions. The route validates it via
`requireCronAuth` in [`web/lib/cron/auth.ts`](../web/lib/cron/auth.ts).

- **Vercel project env**: `CRON_SECRET` (Production + Preview).
- **GitHub repo secrets**: `CRON_SECRET` and `APP_HOST` (hostname only,
  e.g. `fintech-talent-brief.vercel.app`, no scheme, no trailing slash).

Rotate both at once. There is no fallback.

The editorial cron runs the regenerate script directly inside the runner, so
it needs Supabase + Gemini credentials in addition to `CRON_SECRET`:

- `GEMINI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Adding a new scheduled job — decision tree

1. Is it a simple HTTPS cron that calls a Next.js route?
   - **No** (needs container, long-running build, etc.) → GitHub Actions workflow.
   - **Yes** → continue.
2. Are we already at 2 Vercel crons?
   - **No** → add to `web/vercel.json` `crons`.
   - **Yes** → GitHub Actions workflow that `curl`s the route with `CRON_SECRET`.
3. Either way: the route must call `requireCronAuth(req)` first and write a
   `job_runs` row (`job_type` from the approved enum, see `CLAUDE.md`).
4. Update this file.

## Heavy-scraper offload (`scrape-heavy.yml`)

The daily `collect` cron does not directly run browser-based / long-running
scrapers. When `isBrowserScraper(atsType)` is true (see
`web/lib/scrapers/index.ts`), the collect route calls
`triggerScrapeWorkflow(companyId, taskId)` in `web/lib/github.ts`, which
`workflow_dispatch`-es `.github/workflows/scrape-heavy.yml` for that one
company. Each bank scrape is its own GH Actions run — they execute in
parallel, independent of each other and the cron tick.

Currently offloaded:

| Type            | Companies (live + planned)                     | Why                             |
|-----------------|------------------------------------------------|---------------------------------|
| `phenom`        | RBC, BMO, National Bank                        | Phenom is client-rendered → Puppeteer |
| `workday-td`    | TD                                             | API-based but a ~1,500-job cold scrape exceeds Vercel's 300s |
| `workday-cibc`  | CIBC (+ live Simplii classifier)               | Same                            |
| `dayforce`      | (none currently active)                        | Browser scrape                  |
| `successfactors`| Tangerine                                      | Browser scrape (Scotia portal)  |

The `workday-td` and `workday-cibc` scrapers are HTTP-only and could in
principle run inline in Vercel, but a cold corpus run with description
enrichment exceeds the 300s function budget — so they're routed through
GH Actions like the Puppeteer scrapers. Daily-incremental runs (≤ ~100
new postings) would fit inline, but the offload path is simpler and
isolates Workday's rate-limit posture from the live cron tick.

**Fresh-runner retry.** `scrape-heavy.yml` has two jobs: `scrape`, and a
`scrape-retry` (`needs: scrape`, `if: failure()`) that re-runs the scrape
once on a **new runner** when the first attempt fails. This exists because
Akamai (in front of the Workday tenants) intermittently greylists a runner's
datacenter egress IP and returns a `200` + HTML challenge page on the first
listing POST — a per-IP block that clears on a different runner. The retry
reuses the dispatched `task_id`, so both attempts write the **same**
`job_run_tasks` row (no forked task). It retries on any failure, not just the
Akamai block, because that's cheap and the block is the dominant mode; a
second consecutive greylist is rare and the daily cron is the backstop. See
[`web/lib/scrapers/CLAUDE.md`](../web/lib/scrapers/CLAUDE.md) → "Two different
Workday failures."

## Sentry alerts

Every cron route is wrapped in `Sentry.withMonitor(...)` (slug + `crontab`
schedule pair). Sentry alerts when a scheduled run is missed or fails. Slug
mapping lives in [`docs/OBSERVABILITY.md`](./OBSERVABILITY.md). The
`gemini-cost-alarm` workflow does not use `withMonitor` — its job is to fire
`Sentry.captureMessage(...)` with `tags: { alarm: "gemini-cost" }`, so a
separate Sentry alert rule routes it on the alarm tag rather than monitor
state.

## Out of scope

- `config/settings.yaml` has a `schedule:` block. That is for the **legacy
  Python CLI** under `src/` (`run.sh`) and is annotated as dev-only. It does
  not drive production schedules.
- The deprecated `cron_logs` table is gone. All scheduled jobs write to
  `job_runs` instead.
