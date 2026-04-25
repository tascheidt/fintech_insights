# Observability

Server-side error reporting, cron monitoring, and the daily Gemini cost alarm. Browser-side Sentry is intentionally out of scope.

## Sentry

### What's instrumented

- **All API routes** — Next 16 picks up `onRequestError` from [`web/instrumentation.ts`](../web/instrumentation.ts), so any unhandled throw inside a route handler is reported automatically.
- **Cron handlers** — `/api/cron/collect`, `/api/cron/report`, `/api/cron/company-insights` are wrapped in `Sentry.withMonitor(...)` with the slug-and-schedule pair below. Sentry alerts when a scheduled run is missed or fails.
  | Slug                    | Schedule (UTC) | Route                              |
  |-------------------------|----------------|------------------------------------|
  | `cron-collect`          | `0 6 * * *`    | `GET /api/cron/collect`            |
  | `cron-report`           | `0 8 * * 1`    | `GET /api/cron/report`             |
  | `cron-company-insights` | `0 9 * * 1`    | `GET /api/cron/company-insights`   |
- **Internal fan-out routes** under `/api/internal/**` rely on `onRequestError` (no `withMonitor` — they're not scheduled, they're chained).
- **Global error boundary** ([`web/app/global-error.tsx`](../web/app/global-error.tsx)) calls `Sentry.captureException` for any error that escapes every other React boundary.

### Init flow

1. `web/instrumentation.ts` (Next 16 `register` hook) imports `@/lib/env` first to enforce the env schema, then `sentry.server.config.ts` (Node) or `sentry.edge.config.ts` (Edge).
2. Each config calls `Sentry.init({ dsn, environment, tracesSampleRate: 0, ... })`. Tracing is intentionally off (cost). DSN is server-side only (no `NEXT_PUBLIC_` prefix) — browser-side init is out of scope for the launch.
3. `beforeSend` strips `Authorization` and `Cookie` headers from the captured request so secrets don't leak into Sentry.

### Required env vars

| Var                   | Required?                | Notes                                                                               |
|-----------------------|--------------------------|-------------------------------------------------------------------------------------|
| `SENTRY_DSN`          | **prod required**        | Production deploys throw at startup if unset (see `loadEnv()` in `web/lib/env.ts`). |
| `SENTRY_ENVIRONMENT`  | optional                 | Defaults to `VERCEL_ENV ?? "development"`.                                          |
| `VERCEL_ENV`          | injected by Vercel       | Used both for the prod DSN guard and as the Sentry environment fallback.            |

### Verifying locally

1. Drop a real DSN into `web/.env.local` as `SENTRY_DSN=https://...`.
2. `cd web && npm run dev`.
3. `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/report`. Force a failure (e.g. unset `RESEND_API_KEY` then re-set with `invalid` so the retry path fires) — the resulting throw should appear in Sentry within ~30s.

### Viewing errors

Sentry dashboard → "Issues". The cron monitors live under "Crons". Alerts route to the team Slack via Sentry's alert rules (configured in the Sentry UI, not in this repo).

## Resend retry-with-backoff

`/api/cron/report` wraps `resend.batch.send(...)` with `retryResendCall(...)` from [`web/lib/email/resend-retry.ts`](../web/lib/email/resend-retry.ts). Three attempts, exponential backoff (1s / 4s / 16s — well under the 300s cron timeout). Each retry-and-failure logs a structured `log.warn` line. The final per-recipient outcome is persisted to `job_runs.details.email_outcome`. If every recipient fails, the run is marked `failed` and the route re-throws so Sentry's auto-capture picks it up.

If you add a new outbound `resend.emails.send(...)` or `resend.batch.send(...)` call, wrap it with `retryResendCall` for symmetry.

## Daily Gemini cost alarm

A GitHub Actions workflow ([`gemini-cost-alarm.yml`](../.github/workflows/gemini-cost-alarm.yml)) runs daily at 14:00 UTC and `curl`s `/api/admin/cost-alarm` with `Authorization: Bearer ${CRON_SECRET}`.

The route:

1. Sums `estimated_usd` from `gemini_usage_events` over the last 24h.
2. Compares against `GEMINI_DAILY_USD_THRESHOLD` (default **$50**).
3. If over threshold, calls `Sentry.captureMessage("[cost-alarm] Daily Gemini spend exceeded $X")` with a `tags: { alarm: "gemini-cost" }` so Sentry alert rules can target it specifically.

**Auth note:** the route lives under `/api/admin/**` but is gated by `requireCronSecret`, not `requireAdmin`, because the GH Actions runner has no Supabase session. This is the only intentional exception in the `/api/admin/**` namespace and is called out in [`web/lib/auth/CLAUDE.md`](../web/lib/auth/CLAUDE.md).

### Verifying locally

```bash
GEMINI_DAILY_USD_THRESHOLD=0.0001 curl \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/admin/cost-alarm
```

With a low threshold any historical telemetry triggers the message. Check Sentry for the captured event.
