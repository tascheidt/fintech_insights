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

## Scraper-break canary (partial-corpus drop)

Outright scraper errors and zero-result wipes are already caught by [`web/lib/email/scraper-health.ts`](../web/lib/email/scraper-health.ts) at the end of every `/api/cron/collect` run (issue types `failed` and `empty`). Silent partial drops — the scraper still returns *some* jobs but is missing pagination or a careers-site section — used to slip through.

The Phase-3 fragility canary closes that gap for `tier='incumbent'` companies. For each active incumbent it computes:

- `todayNewJobs` — new postings whose `first_seen_date` falls in the current UTC day.
- `rollingAvg7d` — average new-postings per day over the 7 calendar days *before* today.

The canary fires for a bank when BOTH thresholds hold:

- `todayNewJobs < 0.5 * rollingAvg7d` (a >50% day-over-day drop), AND
- `rollingAvg7d > 5` (suppress the alert on banks with low baseline volume so a legitimately quiet day doesn't page).

**Only incumbents whose scrape for the run has actually LANDED are evaluated** (`opts.evaluableCompanyIds` — the task is terminal `completed`/`failed`/`cancelled` and not already reported as a `failed`/`empty` issue). This matters because *every* incumbent is a heavy browser scraper offloaded to GitHub Actions, so its rows ingest minutes-to-an-hour *after* `collect` returns and the run is marked complete (`runner.ts` treats offloaded `running` tasks as non-blocking). Without the gate the canary races the offloaded scrapes and reads `0 new today` for every bank — exactly the false "6 incumbent scrapers" alert of June 2026, which was simultaneously *masking* three genuinely-broken scrapers (Scotia/TD dying on the oversized `scraped_data` write — `57014`/`520`; RBC being killed at the `scrape-heavy.yml` 30-min timeout mid-enrichment, so its task never reached ingest and read `0 new today`). A genuinely-broken scraper still fires correctly: its task terminalizes (`completed` with 0 jobs, or `failed`) and `todayNewJobs` is 0. A scraper still `running` at the canary's last invocation that day is caught the next day (or via the `failed` issue path after the stale-task sweep).

The pure threshold rule is `evaluateCanary({today, rolling}) → { fire, reason }` in [`web/lib/email/scraper-health.ts`](../web/lib/email/scraper-health.ts); it has unit tests in `scraper-health.test.ts`. Firing canaries are appended to the existing scraper-alert email under a "Scraper-break canary" section so admins don't get a second message. Failed canary detection logs a structured `log.error` but never blocks the rest of the scraper-health flow.

## Staleness watchdog (persistent, all active companies)

The `failed`/`empty` issues and the canary all share a blind spot: they only see **the current run's tasks**, and `empty` only fires on the transition day (`closedThisRun > 0`). Miss that one email and every following day reads healthy — zero active jobs, zero closed this run, no alert. That persistence gap is how Koho sat dark for months after migrating its board to Ashby (July 2026).

`detectStaleCompanies` in [`web/lib/email/scraper-health.ts`](../web/lib/email/scraper-health.ts) closes it. On every collect run it evaluates **every** `is_active=true` company and appends a "Staleness watchdog" section to the same scraper-alert email — re-firing daily until the company is fixed or deactivated:

- `stale_scrape` — no `completed` scrape task in `STALE_SCRAPE_THRESHOLD_DAYS` (7) days, or never.
- `no_active_jobs` — zero `is_active=true` postings.

Scope rules: incumbent-tier companies are excluded while `incumbent_tracking_enabled` is off (parked intentionally); sub-brands (`parent_company_id` set, e.g. Simplii) are only checked on the postings signal (they never get their own scrape task); companies younger than the threshold are in onboarding grace; companies already flagged as `failed`/`empty` in the run aren't double-reported. The pure rule is `evaluateStaleness(...)`, unit-tested in `scraper-health.test.ts`. Errors are swallowed/logged — the watchdog never blocks the health email.

## Weekly scraper-drift check (config vs reality)

The daily checks watch scrape *outcomes*; nothing re-asks whether the stored ATS *config* still matches reality — a deactivated company's board coming back to life, or an active company's `careers_url` now resolving to a different provider. The weekly drift check ([`.github/workflows/scraper-drift-check.yml`](../.github/workflows/scraper-drift-check.yml), Mon 12:00 UTC, running [`web/scripts/scraper-drift-check.ts`](../web/scripts/scraper-drift-check.ts) in-runner) probes exactly that:

- `dormant_live_board` — an inactive `tier='fintech'` company with a live board showing open roles, found by probing the configured board **and** trying the company slug on every API-probeable provider (lever/greenhouse/workable/ashby — the "slug sweep"). This is the probe that would have caught Koho months earlier. `companies.deactivated_reason` (migration `20260714000000`) is included in the alert so intentional dormancy ("shut down") is distinguishable from a parked broken scraper — set it whenever deactivating a company.
- `ats_drift` — an active company whose `careers_url` resolves (high-confidence `detectATSFromUrl`) to a different `ats_type`/`ats_identifier` than configured.
- `dead_config` — an active company whose configured API board endpoint no longer answers, with any live slug-sweep hit named as the likely destination.

Findings are emailed to admins via Resend (`--dry-run` logs only). Decision rules are pure in [`web/lib/scrapers/drift.ts`](../web/lib/scrapers/drift.ts), unit-tested in `drift.test.ts`. The script exits 0 even with findings — the email is the signal; non-zero is reserved for the script itself breaking.

## Daily Gemini cost alarm

A GitHub Actions workflow ([`gemini-cost-alarm.yml`](../.github/workflows/gemini-cost-alarm.yml)) runs daily at 14:00 UTC and `curl`s `/api/admin/cost-alarm` with `Authorization: Bearer ${CRON_SECRET}`.

The route reads the last 24h of `gemini_usage_events` and fires on **any of three independent tripwires** (pure math in [`web/lib/ai/cost-alarm-eval.ts`](../web/lib/ai/cost-alarm-eval.ts), unit-tested):

1. **Calibrated USD** — `SUM(estimated_usd)` (already calibrated at write time by `estimateUsd` — reconciled token rates + `GROUNDING_CALIBRATION`), vs `GEMINI_DAILY_USD_THRESHOLD` (default **$50**).
2. **Grounded-call count** — count of `grounding_enabled` events, vs `GEMINI_DAILY_GROUNDED_CALL_THRESHOLD` (default **500**).
3. **Token volume** — `SUM(total_tokens)`, vs `GEMINI_DAILY_TOKEN_THRESHOLD` (default **15,000,000**).

If any trips, it calls `Sentry.captureMessage("[cost-alarm] Daily Gemini usage tripwire(s): …")` with `tags: { alarm: "gemini-cost", tripwire: "usd+grounded-calls+…" }` so Sentry rules can target it.

**Why three signals:** `estimated_usd` is a model that under-counts the GCP invoice ~2.7x — and most on the grounded calls that drive spikes (the 2026-05 spike never paged: telemetry saw $27 < $50 on a ~$90 day). Grounded-call count and raw token volume come from un-priced SDK fields, so a fan-out spike pages even when the dollar estimate is wrong. See [`AI_HYGIENE.md`](./AI_HYGIENE.md) → "Cost reconciliation".

**Auth note:** the route lives under `/api/admin/**` but is gated by `requireCronSecret`, not `requireAdmin`, because the GH Actions runner has no Supabase session. This is the only intentional exception in the `/api/admin/**` namespace and is called out in [`web/lib/auth/CLAUDE.md`](../web/lib/auth/CLAUDE.md).

### Verifying locally

```bash
GEMINI_DAILY_USD_THRESHOLD=0.0001 curl \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/admin/cost-alarm
```

With a low threshold any historical telemetry triggers the message. Check Sentry for the captured event.
