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

- **`gemini-pricing.ts`** — Per-model token rates, **reconciled to the GCP SKU export (2026-05): the aliases resolve to Gemini 3.x** (e.g. `gemini-flash-latest` → Gemini 3.5 Flash at $1.50/$9.00 per 1M). Re-derive `SKU $ ÷ SKU token count` from a fresh export whenever `estimated_usd` drifts from billing — a silent alias rotation to a pricier model is the failure mode. **`estimateUsd` bills reasoning tokens at the output rate** — don't add a separate "thoughts" price column unless Google starts charging differently. `GROUNDING_CALIBRATION` is `0` while Google Search grounding stays free-tier. See [`docs/AI_HYGIENE.md`](../../../docs/AI_HYGIENE.md) → "Cost reconciliation".
- **`cost-alarm-eval.ts`** — pure tripwire math for `/api/admin/cost-alarm` (calibrated USD / grounded-call count / token volume). I/O-free + unit-tested; the route does the query + Sentry.

## Voice directive

- **`voice.ts`** — The runtime voice rules. **Mandatory** on user-facing surfaces (digest, company insight, chat, narrative). **Forbidden** on internal extraction/classification prompts (extraction output is never shown to users; the voice directive only burns tokens there). See [`docs/voice.md`](../../../docs/voice.md) for the editorial rules behind the runtime directive.
- **`voice-validator.ts`** — Heuristic checks. Use in tests for user-facing prompts.

When you change voice tone, update `docs/voice.md` and `voice.ts` in the same PR.

## Provider abstraction (eval-only — `providers/`)

The `providers/` subdir is a **default-safe seam** for the open-model evaluation
harness, NOT a production provider switch. Full methodology in
[`docs/OPEN_MODEL_EVALUATION.md`](../../../docs/OPEN_MODEL_EVALUATION.md).

- **`providers/registry.ts`** — `EVAL_MODEL_REGISTRY` (Qwen3-30B-A3B, Llama 4
  Scout, Mistral Small, DeepSeek V4-Flash + their Fireworks slugs; GLM-5.2 retired
  after Round 1) and `resolveProvider(modelId)`. These ids are
  deliberately kept **out of** `AI_MODEL_OPTIONS` so the admin UI never exposes an
  unvetted model. `resolveProvider` returns `"gemini"` for everything not in the
  registry — so any production call site that never passes an eval id runs its
  exact existing Gemini code path.
- **`providers/openai-compat.ts`** — fetch-based Fireworks (OpenAI-compatible)
  client + pure `mapOpenAiUsage()` that maps OpenAI usage onto the
  `gemini-meter` shape, so `recordUsage` / pricing / telemetry work unchanged.
- **`eval/agreement.ts`** — pure output-agreement scorers (L1 field agreement for
  extraction, role-category agreement for categorize). This is where the
  "≥95% L1 agreement" gate is actually computed.
- **Pricing:** candidate sticker rates (`qwen3-30b-a3b`, `llama4-scout`,
  `mistral-small`, `deepseek-v4-flash`; `glm-5.2` retained for old artifacts) live
  in `gemini-pricing.ts` alongside the Gemini rows (the table is keyed by model
  string; `estimateUsd` returns 0 for unknown models).
- Driven by `web/scripts/model-bakeoff.ts`; never wired into a cron or route.
  `FIREWORKS_*` env is optional (eval only). **No production default changed.**

## Specialized helpers

- **`strategy-analysis.ts`** — Strategy-narrative helpers shared by digest and company insight surfaces.
- **`tech-stack-extraction.ts`** / **`tech-stack-aggregation.ts`** — Detects and aggregates company tech-stack signals from descriptions.
- **`embeddings.ts`** — `embedText()` wraps `gemini-embedding-001` (768d, L2-normalized) for Jobs semantic search; meters like any other call site. Two callers: the `backfill-job-embeddings.ts` sweep and the `/jobs` semantic query path in `dashboard-queries.ts`. `jobEmbeddingInput()` composes the per-job text (title + summary/description).

## Named model handles

`PRO_MODEL` / `FLASH_MODEL` in `prompt-config.ts` are typed as `ApprovedModel`, so a call site that always wants one tier (and has no user-selectable config row) imports the handle instead of retyping the literal. Removing or renaming an entry in `AI_MODEL_OPTIONS` then fails the build at the call site rather than leaving a stray string behind. `feedback-triage.ts` uses `PRO_MODEL` this way.

## Rules of the road

1. **No hardcoded model strings outside `prompt-config.ts`.** A model id living outside this repo is the same failure with a longer fuse: feedback triage ran from a Supabase Edge Function pinned to `gemini-3-pro-preview`, which `prompt-config.test.ts` names by example and could not catch, because the call site was out of tree. Google retired that id on 2026-07-31 and every submission silently stopped being triaged.
2. **Every new call site writes to `gemini_usage_events`** via `writeUsageEvent`.
3. **Don't stack grounded calls** — check upstream for an existing `googleSearch` enable before adding another. The Apr 2026 incident was two grounded Pro calls per job.
4. **Cache keys include `prompt_config_version`** — otherwise prompt tweaks silently serve stale outputs.
5. **Voice directive is user-facing only** — never on extraction/classification.
6. **PRs touching this directory MUST run `gemini-compare.ts`** and attach the markdown report. Commit the JSON under `web/scripts/artifacts/`.
7. **Read `companies` / `job_postings` through the `active_companies` / `active_job_postings` views**, not the base tables — a deactivated company must never feed a user-facing surface. Enforced by `design-system/active-company-scope`. See root CLAUDE.md §7 "Company-active read scoping."
