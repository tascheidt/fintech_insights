# AI hygiene

Rules for every Gemini call. This file is the long-form home for the call-site discipline that root `CLAUDE.md` only summarizes.

## Why these rules exist

In April 2026, Gemini cost drifted above target and ate a debugging cycle the team doesn't want to repeat. The proximate cause was two grounded Pro calls firing per new job inside `analyzeJobAdvanced`. The deeper cause was that we had no production telemetry, so the drift went unnoticed for weeks.

The Phase-1 comparison harness (`web/scripts/gemini-compare.ts`) and Phase-5 `gemini_usage_events` telemetry exist so we can detect the next drift before it bills.

## The five rules

### 1. Every new call-site writes to `gemini_usage_events`

Use `writeUsageEvent` from `@/lib/ai/gemini-telemetry`. It is fire-and-forget — errors are swallowed so a flaky DB insert never breaks the user-facing call.

Standard pattern:

1. Call `recordUsage(...)` from `@/lib/ai/gemini-meter` to build a `UsageRecord`.
2. Pass that record to `writeUsageEvent(record)`.
3. If the function may be driven by scripts that capture records in-memory, also fire the optional `onUsage` observer callback. Existing instrumented sites do this — copy the pattern.

If your new call site is wrapped by an existing helper that already meters, *don't* meter again. Double-counting in `gemini_usage_events` is just as misleading as missing data.

### 2. Run `gemini-compare.ts` on PRs touching `web/lib/ai/**` or `web/lib/analysis/**`

Attach the markdown report to the PR description. Commit the resulting JSON under `web/scripts/artifacts/`.

Commands:

```bash
# Establish a baseline
npx tsx --env-file=.env.local scripts/gemini-compare.ts --scenario=<name> --mode=baseline

# Compare against a prior baseline
npx tsx --env-file=.env.local scripts/gemini-compare.ts --scenario=<name> --mode=compare --baseline=<prior-artifact>
```

The seeded 20-job fixture at `web/scripts/fixtures/gemini-sample-jobs.json` is the source of truth. **Regenerate it annually, not per change** — if everyone regenerates the fixture per PR, we lose the longitudinal signal.

### 3. Don't stack grounded calls

Before adding a new `googleSearch`-grounded call, check whether an upstream call already enables grounding. The Apr 2026 incident was two grounded Pro calls in series for the same job. They cost as much as one call and produce duplicate work.

When in doubt, pass `webSearchContext` explicitly to share grounding output across calls.

### 4. Cache keys must include `prompt_config_version`

Otherwise prompt tweaks silently serve stale outputs forever. Any response cache (in-memory, Supabase, KV, anywhere) that keys off prompt content needs `prompt_config_version` mixed into the key.

### 5. Voice directive is mandatory user-facing, forbidden internal

The voice directive from `web/lib/ai/voice.ts` is mandatory on user-facing surfaces:

- Weekly digest copy
- Company insight narratives
- **Company editorial** (thesis, interpretation, bets — `web/lib/analysis/company-editorial.ts`)
- **Cross-company theme labels** (Jobs page right rail — `web/lib/analysis/cross-company-themes.ts`)
- Chat
- Strategy narrative

It is **forbidden** on internal extraction/classification prompts. Extraction output is never shown to users; the voice rules only eat tokens there. Adding the voice directive to `extractJobStructure` is a code-review reject.

See `docs/voice.md` for the editorial rules themselves.

### 6. Reuse upstream research before stacking calls

The company editorial engine was tempted to fire its own grounded research call. Instead it loads the most recent `company_insights` row (which already paid the grounded-Pro cost) and feeds it as background context. New surfaces that need company context should follow the same pattern: read the most recent insight, not start a new grounded call.

## Approved models (recap)

Single source of truth lives in `web/lib/ai/prompt-config.ts` (`AI_MODEL_OPTIONS` enum). Never hardcode a model string outside that module.

- `gemini-pro-latest` — advanced analysis with web search/grounding; deeper reasoning and narrative quality.
- `gemini-flash-latest` — fast, cost-effective; default for extraction, classification, digest, chat.
- `gemini-flash-lite-latest` — cheapest tier for high-volume, low-stakes calls. Use only where the comparison report confirms ≥95% L1 field agreement. (Extraction was evaluated against it in 2026-05 and **kept on Flash** — it failed the gate. See "Cheaper extraction" below.)

## Editorial pipeline call sites

The v2 editorial fields (working thesis, interpretation, strategic bets, last meaningful change) are populated by these call sites — both telemetered, both narrative-voice:

| Call site                  | Module                                       | Model                  | Grounded | Prompt version              |
|----------------------------|----------------------------------------------|------------------------|----------|-----------------------------|
| `generateCompanyEditorial` | `web/lib/analysis/company-editorial.ts`      | `gemini-pro-latest`    | no       | `company-editorial-v1`      |
| `generateThemeLabels`      | `web/lib/analysis/cross-company-themes.ts`   | `gemini-flash-latest`  | no       | `cross-company-themes-v1`   |

Both are refreshable via `web/scripts/regenerate-editorial.ts` (per company or `--all`) and the `editorial-cron.yml` GH Actions workflow (Mondays 11:00 UTC). The bet auto-suggestions surfaced in the editorial form are rule-based (`web/lib/analysis/bet-suggester.ts`) — no AI calls.

**Never pin a versioned or preview model ID** (e.g. `gemini-3-flash-preview`, `gemini-2.0-flash`, `gemini-1.5-pro`). Always the `-latest` alias. The comparison harness and production telemetry are how we catch a bad alias rotation; pinning bypasses that signal.

## Cost reconciliation & the daily alarm

`estimateUsd` (`web/lib/ai/gemini-pricing.ts`) is a **cost model, not the invoice**. A 2026-05 audit found telemetry (`SUM(estimated_usd)`) under-counted the GCP bill ~2.7x ($66 telemetry vs $178.75 billed for May), the gap concentrated on the **grounded Pro path** (`analyzeJobAdvanced`, `performDeepResearch`): grounding is billed as search-query fan-out plus search-injected context tokens that `input_tokens` under-reports, while the model charges a flat `$0.035`/request.

- **Calibration knob:** `GROUNDING_CALIBRATION` (default **1**, a no-op) scales the grounded portion of `estimateUsd`. Set it from a clean GCP SKU export: `invoice grounding $ ÷ telemetry grounding $` over the same window. `COST_CALIBRATION_NOTE` records the audit numbers in code. Re-reconcile quarterly — this is a model, not parity.
- **The daily alarm is multi-signal.** `/api/admin/cost-alarm` no longer trusts one dollar number (that's why the May spike never paged — telemetry saw $27 < $50 on a ~$90 day). It trips on ANY of: calibrated USD (`GEMINI_DAILY_USD_THRESHOLD`, $50), grounded-call **count** (`GEMINI_DAILY_GROUNDED_CALL_THRESHOLD`, 500), or **token volume** (`GEMINI_DAILY_TOKEN_THRESHOLD`, 15M). The count + token wires read un-priced SDK fields, so a fan-out spike pages even when the dollar estimate is wrong. Pure tripwire math is in `web/lib/ai/cost-alarm-eval.ts` (unit-tested).
- **Go-forward attribution** — the query that drives the monthly review:
  ```sql
  SELECT date_trunc('day',created_at)::date AS day, call_site, model_served,
         COUNT(*) calls, ROUND(SUM(estimated_usd)::numeric,2) usd,
         SUM((grounding_enabled)::int) grounded
  FROM gemini_usage_events WHERE created_at >= now() - interval '30 days'
  GROUP BY 1,2,3 ORDER BY 1 DESC, usd DESC;
  ```

## Cheaper extraction: thinking budget, Flash-Lite, open-source

Silver-layer extraction (`extractJobStructure`) is the highest-volume call site (~66% of measured spend in the 2026-05 audit). Levers, in the order we adopted them:

1. **Disable reasoning tokens (adopted).** Extraction is mechanical JSON — no reasoning budget needed. It sets `thinkingConfig: { thinkingBudget: 0 }`; the harness confirms thoughts→0 and per-call cost fell ~72% ($0.0044 → $0.00133) with identical fields (same model). A one-shot degrade retries without the override if a future `gemini-flash-latest` alias rotation rejects budget 0.
2. **Don't re-extract unchanged jobs (adopted).** The `description_hash` gate fingerprints `normalizeDescriptionForHash(text)` (strips posting dates, applicant counts, requisition IDs, whitespace) so volatile boilerplate no longer flips the hash — ~88% of daily extractions were such re-runs. Legacy raw hashes are bridged in-code on the next scrape (no migration, no re-extraction sweep). Measure with `web/scripts/measure-hash-thrash.ts` (read-only).
3. **Flash-Lite for extraction (REJECTED 2026-05).** `gemini-flash-lite-latest` is ~4x cheaper but **failed the ≥95% L1 gate**: it disagreed with Flash on `function_category` (e.g. `it-internal-systems`→`engineering-platform-sre-devops`, `sales-account-executives`→`account-management-customer-success`) and `seniority`, and degraded `tech_stack` Jaccard (which powers the company tech panels). Artifacts under `web/scripts/artifacts/`. With (1)+(2) already cutting extraction ~90%, the extra ~$2/mo wasn't worth misclassifying roles. Re-evaluate only if the prompt is hardened for the cheaper tier.
4. **Open-source / non-Gemini providers (NOT NOW).** At ~20k calls/mo the spread between Flash-Lite (~$6/mo) and the cheapest open-weight option (DeepInfra Gemma-3-4B ~$2/mo) is ~$2–4/mo — against ~0.5–1.5 eng-days to add a second SDK, a telemetry provider field, a pricing entry, and a second vendor in the ingest hot path. Break-even is ~150k–300k calls/mo (8–15x today), and even there the first lever is **Gemini batch mode (−50%, zero new vendor)** for backfills. A non-Gemini provider only earns its keep past ~400k–700k calls/mo (20–40x). Two zero-integration Gemini fallbacks if extraction ever needs to get cheaper: **Gemma-3 on the free tier** of the existing Gemini API (~1k req/day cap; free-tier inputs may train Google — fine for public JD text) and **batch mode**.

## Quota errors

If you see `limit: 0` quota errors, the API key may need:

1. Billing enabled on the Google Cloud project.
2. Gemini API enabled in the project.
3. Access granted to preview models (request at https://ai.google.dev/).
