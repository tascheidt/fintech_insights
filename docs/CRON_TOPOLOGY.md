# Cron Topology

Three scheduled jobs run in production. Two live on Vercel (Hobby plan caps at 2),
one runs from GitHub Actions and calls back into the deployed app over HTTPS.

## Jobs

| Job               | Venue          | Schedule (UTC) | Endpoint                          | Auth                                  |
|-------------------|----------------|----------------|-----------------------------------|---------------------------------------|
| collect           | Vercel cron    | `0 6 * * *`    | `GET /api/cron/collect`           | Vercel-injected `Bearer CRON_SECRET`  |
| report            | Vercel cron    | `0 8 * * 1`    | `GET /api/cron/report`            | Vercel-injected `Bearer CRON_SECRET`  |
| company-insights  | GitHub Actions | `0 9 * * 1`    | `GET /api/cron/company-insights`  | Workflow sends `Bearer CRON_SECRET`   |

Source of truth:
- Vercel: [`web/vercel.json`](../web/vercel.json) `crons` array.
- GitHub Actions: [`.github/workflows/company-insights-cron.yml`](../.github/workflows/company-insights-cron.yml).

The `report` job also generates one company insight per run as a side effect,
so the GH Actions trigger is incremental — it just keeps the rolling backlog
covered between weekly digest runs.

## Required secrets

Both venues use the same `CRON_SECRET` value. The route validates it via
`requireCronAuth` in [`web/lib/cron/auth.ts`](../web/lib/cron/auth.ts).

- **Vercel project env**: `CRON_SECRET` (Production + Preview).
- **GitHub repo secrets**: `CRON_SECRET` and `APP_HOST` (hostname only,
  e.g. `fintech-talent-brief.vercel.app`, no scheme, no trailing slash).

Rotate both at once. There is no fallback.

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

## Out of scope

- `config/settings.yaml` has a `schedule:` block. That is for the **legacy
  Python CLI** under `src/` (`run.sh`) and is annotated as dev-only. It does
  not drive production schedules.
- The deprecated `cron_logs` table is gone. All scheduled jobs write to
  `job_runs` instead.
