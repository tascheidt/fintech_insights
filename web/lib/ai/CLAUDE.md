# `web/lib/ai` — agent context

Shared infrastructure for Gemini calls. The full hygiene rules live in [`docs/AI_HYGIENE.md`](../../../docs/AI_HYGIENE.md). This file is the in-directory reminder.

## Single source of truth

- **`prompt-config.ts`** — `AI_MODEL_OPTIONS` enum. **Every model string in the codebase resolves through here.** Do not hardcode `"gemini-flash-latest"` (or any other model name) anywhere else. If a new caller needs a model that isn't in the enum, add it to the enum.
- **`prompt-config.ts`** also exports `EMBEDDING_MODEL` / `EMBEDDING_DIMS` (`gemini-embedding-001`, 768d) for Jobs semantic search. Embedding models have no floating `-latest` alias, so this one is pinned — but it's still the single source of truth; resolve through it, never hardcode. A change here means a re-embed backfill (rows stamp `embedding_model`/`embedding_dims`; cross-model vectors don't compare).

## Telemetry

Every Gemini call site writes to `gemini_usage_events`:

1. `recordUsage(...)` from `gemini-meter.ts` builds a `UsageRecord` (token counts, latency, model, scenario).
2. `writeUsageEvent(record)` from `gemini-telemetry.ts` persists it. Fire-and-forget — errors are swallowed.
3. If the function is also driven from scripts that capture records in-memory, fire the optional `onUsage` observer alongside the DB write.

If your call is wrapped by an existing helper that already meters, do not meter again. Double-counting is as misleading as missing data.

**Gemini 2.5 reasoning tokens.** The 2.5 series (Pro AND Flash with structured-output prompts) returns reasoning/"thinking" tokens in `usageMetadata.thoughtsTokenCount`, and folds them into `totalTokenCount`. They are billed at the **output** rate. `recordUsage` reads the named field OR infers from the `totalTokenCount` residual when the SDK omits it (Flash 2.5 does this in practice). If a future SDK version exposes more named fields, update `gemini-meter.ts` AND backfill historical rows. The May 2026 audit found we'd been silently undercounting Flash extract spend ~3x by ignoring this; see v2.2.1 changelog.

## Pricing & cost math

- **`gemini-pricing.ts`** — Per-model token pricing used by the meter and the comparison harness. Update when Google's price list changes. **`estimateUsd` bills reasoning tokens at the output rate** — don't add a separate "thoughts" price column unless Google starts charging differently.

## Voice directive

- **`voice.ts`** — The runtime voice rules. **Mandatory** on user-facing surfaces (digest, company insight, chat, narrative). **Forbidden** on internal extraction/classification prompts (extraction output is never shown to users; the voice directive only burns tokens there). See [`docs/voice.md`](../../../docs/voice.md) for the editorial rules behind the runtime directive.
- **`voice-validator.ts`** — Heuristic checks. Use in tests for user-facing prompts.

When you change voice tone, update `docs/voice.md` and `voice.ts` in the same PR.

## Specialized helpers

- **`strategy-analysis.ts`** — Strategy-narrative helpers shared by digest and company insight surfaces.
- **`tech-stack-extraction.ts`** / **`tech-stack-aggregation.ts`** — Detects and aggregates company tech-stack signals from descriptions.
- **`embeddings.ts`** — `embedText()` wraps `gemini-embedding-001` (768d, L2-normalized) for Jobs semantic search; meters like any other call site. Two callers: the `backfill-job-embeddings.ts` sweep and the `/jobs` semantic query path in `dashboard-queries.ts`. `jobEmbeddingInput()` composes the per-job text (title + summary/description).

## Rules of the road

1. **No hardcoded model strings outside `prompt-config.ts`.**
2. **Every new call site writes to `gemini_usage_events`** via `writeUsageEvent`.
3. **Don't stack grounded calls** — check upstream for an existing `googleSearch` enable before adding another. The Apr 2026 incident was two grounded Pro calls per job.
4. **Cache keys include `prompt_config_version`** — otherwise prompt tweaks silently serve stale outputs.
5. **Voice directive is user-facing only** — never on extraction/classification.
6. **PRs touching this directory MUST run `gemini-compare.ts`** and attach the markdown report. Commit the JSON under `web/scripts/artifacts/`.
