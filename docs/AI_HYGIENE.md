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
- Chat
- Strategy narrative

It is **forbidden** on internal extraction/classification prompts. Extraction output is never shown to users; the voice rules only eat tokens there. Adding the voice directive to `extractJobStructure` is a code-review reject.

See `docs/voice.md` for the editorial rules themselves.

## Approved models (recap)

Single source of truth lives in `web/lib/ai/prompt-config.ts` (`AI_MODEL_OPTIONS` enum). Never hardcode a model string outside that module.

- `gemini-pro-latest` — advanced analysis with web search/grounding; deeper reasoning and narrative quality.
- `gemini-flash-latest` — fast, cost-effective; default for extraction, classification, digest, chat.
- `gemini-flash-lite-latest` — cheapest tier for high-volume, low-stakes calls. Use only where the comparison report confirms ≥95% L1 field agreement.

**Never pin a versioned or preview model ID** (e.g. `gemini-3-flash-preview`, `gemini-2.0-flash`, `gemini-1.5-pro`). Always the `-latest` alias. The comparison harness and production telemetry are how we catch a bad alias rotation; pinning bypasses that signal.

## Quota errors

If you see `limit: 0` quota errors, the API key may need:

1. Billing enabled on the Google Cloud project.
2. Gemini API enabled in the project.
3. Access granted to preview models (request at https://ai.google.dev/).
