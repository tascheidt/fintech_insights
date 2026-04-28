# Cron Topology

Five scheduled jobs run in production. Two live on Vercel (Hobby plan caps at 2),
three run from GitHub Actions. Most GH Actions cron jobs `curl` back into the
deployed Next.js app; the editorial cron is the exception — it runs the
regenerate script directly inside the runner because GH Actions has the
runtime budget for the Pro calls.

## Jobs

| Job                | Venue          | Schedule (UTC) | Endpoint / runtime                                    | Auth                                  |
|--------------------|----------------|----------------|-------------------------------------------------------|---------------------------------------|
| collect            | Vercel cron    | `0 6 * * *`    | `GET /api/cron/collect`                               | Vercel-injected `Bearer CRON_SECRET`  |
| report             | Vercel cron    | `0 8 * * 1`    | `GET /api/cron/report`                                | Vercel-injected `Bearer CRON_SECRET`  |
| company-insights   | GitHub Actions | `0 9 * * 1`    | `GET /api/cron/company-insights`                      | Workflow sends `Bearer CRON_SECRET`   |
| editorial          | GitHub Actions | `0 11 * * 1`   | `npx tsx web/scripts/regenerate-editorial.ts`         | Service-role + Gemini secrets in repo |
| gemini-cost-alarm  | GitHub Actions | `0 14 * * *`   | `GET /api/admin/cost-alarm`                           | Workflow sends `Bearer CRON_SECRET`   |

Source of truth:
- Vercel: [`web/vercel.json`](../web/vercel.json) `crons` array.
- GitHub Actions: [`.github/workflows/company-insights-cron.yml`](../.github/workflows/company-insights-cron.yml), [`.github/workflows/editorial-cron.yml`](../.github/workflows/editorial-cron.yml), [`.github/workflows/gemini-cost-alarm.yml`](../.github/workflows/gemini-cost-alarm.yml).

The `report` job also generates one company insight per run as a side effect,
so the GH Actions trigger is incremental — it just keeps the rolling backlog
covered between weekly digest runs.

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
