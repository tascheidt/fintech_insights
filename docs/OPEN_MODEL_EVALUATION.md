# Open-Model Evaluation (GLM-5.2 / DeepSeek V4-Flash vs Gemini)

**Status:** evaluation harness landed; live bake-off pending (needs network egress
for Fireworks + a `GEMINI_API_KEY` for the baseline arm). **No production model
default has changed.** This document is the methodology + how-to-run + where to
record results.

## Why

Gemini spend has grown (per-job hot path = Flash extract + Pro grounded analyze,
plus per-company and per-week calls). Open-weight models have closed the quality
gap and are far cheaper at the API. This effort builds the scaffolding to decide,
with hard numbers, whether any task should move off Gemini — it does **not** move
anything yet.

Sticker rates (per 1M tokens, ~2026-06) for context:

| model | input | output | role |
|---|---|---|---|
| `gemini-flash-latest` | $1.50 | $9.00 | current extraction / digest |
| `gemini-pro-latest` | $2.00 | $12.00 | current grounded analysis |
| `glm-5.2` (Fireworks) | $1.20 | $4.10 | reasoning / narrative candidate |
| `deepseek-v4-flash` (Fireworks) | $0.14 | $0.28 | high-volume extraction candidate |

The headline prize is **extraction**: highest volume, no grounding, mechanical
JSON. DeepSeek V4-Flash output is ~32x cheaper than Flash on a sticker basis —
*if* quality holds. The harness exists to test exactly that.

## Decisions

- **Evaluation only.** Build the seam + harness, run the bake-off, write up the
  result. Migrate nothing in this work.
- **Candidates:** GLM-5.2, DeepSeek V4-Flash, scored against Gemini as baseline.
- **Host:** Fireworks (US-based, OpenAI-compatible) — drop-in for the seam, keeps
  job text off China-direct endpoints.
- **Embeddings:** out of scope (deferred; a swap there forces a full re-embed).
- **Grounded tasks** (`analyzeJobAdvanced`, `performDeepResearch`) are out of
  scope here — open models have no native grounding. See "Grounded tasks" below.

## Architecture: the eval seam

A minimal, **default-safe** provider abstraction. The Gemini code path is
unchanged byte-for-byte; the seam only branches when a call site is explicitly
handed an eval model id.

- `web/lib/ai/providers/registry.ts` — `EVAL_MODEL_REGISTRY` (the candidates and
  their Fireworks slugs) and `resolveProvider(modelId)`. Kept **out of**
  `AI_MODEL_OPTIONS` so the admin UI never exposes an unvetted model. Anything
  not in the registry resolves to `"gemini"`.
- `web/lib/ai/providers/openai-compat.ts` — fetch-based Fireworks client + a pure
  `mapOpenAiUsage()` that maps OpenAI usage onto the `gemini-meter` shape, so the
  existing `recordUsage` / pricing / telemetry path costs an open-model call with
  no changes.
- `web/lib/ai/gemini-pricing.ts` — adds `glm-5.2` / `deepseek-v4-flash` sticker
  rates so `estimateUsd` can cost candidate runs (it returns `0` for unknown
  models otherwise).
- Seam wired into `extractJobStructure` (`structure.ts`) and `categorizePosting`
  (`categorizer.ts`): Gemini ids → existing inline Gemini code; eval ids →
  `openAiCompatGenerate` with the **same prompt + JSON mode** and the same
  parse/retry logic. (`categorizePosting` also gained the
  `gemini_usage_events` telemetry it was previously missing.)

## Measurement

### Scorers — `web/lib/ai/eval/agreement.ts` (pure, unit-tested)

- **L1 field agreement (extraction).** Per-field comparison: exact match for the
  enums (`seniority_level`, `standardized_department`, `function_category`),
  null-aware salary + location, Jaccard for `tech_stack` / `keywords`. `summary`
  is reported via a Dice similarity but **excluded from the L1 gate** (stylistic,
  not correctness). This implements the "≥95% L1 agreement" gate the docs assume
  exists but never actually computed.
- **Classification agreement (categorize).** `role_category` exact match
  (decision-driving), plus section-presence agreement and a quality-score delta.

### Two reference baselines

1. **Gemini-as-reference** (automatic): each candidate vs the current Gemini
   output. Fast, but measures *similarity to Gemini*, not truth.
2. **Golden set** (the anchor): `web/scripts/fixtures/golden-extraction.json` — a
   human-verified set (~25-30 stratified jobs). Score every model, including
   Gemini, against it to measure **correctness**. Populate it, then pass
   `--reference=golden`.

### Harness — `web/scripts/model-bakeoff.ts`

Runs a scenario across N models against the committed fixture
(`web/scripts/fixtures/gemini-sample-jobs.json`, 24 real jobs), captures per-call
usage via each function's `onUsage` hook, computes cost + agreement, and writes a
JSON artifact + markdown report to `web/scripts/artifacts/`.

### Spend baseline — `web/scripts/gemini-spend-report.ts`

Read-only rollup of `gemini_usage_events` by call-site and model over a window
(default 30d), so the bake-off and any migration are prioritized by real spend
(the cost-alarm route only looks at 24h).

## How to run

Prereqs (env in `web/.env.local`): `FIREWORKS_API_KEY`, and `GEMINI_API_KEY` for
the baseline arm. Network egress must allow `api.fireworks.ai` and
`generativelanguage.googleapis.com`. Keep `GEMINI_TELEMETRY_DISABLED=1` so
fixture runs don't pollute the production telemetry table.

```bash
cd web

# 0. Size the prize (where Gemini spend actually goes).
npx tsx --env-file=.env.local scripts/gemini-spend-report.ts --days=30

# 1. Extraction bake-off (highest-value, lowest-risk).
npx tsx --env-file=.env.local scripts/model-bakeoff.ts \
  --scenario=extract-structure \
  --models=gemini-flash-latest,glm-5.2,deepseek-v4-flash

# 2. Categorization bake-off.
npx tsx --env-file=.env.local scripts/model-bakeoff.ts \
  --scenario=categorize \
  --models=gemini-flash-latest,glm-5.2,deepseek-v4-flash

# 3. (After populating the golden set) score correctness, not just similarity.
npx tsx --env-file=.env.local scripts/model-bakeoff.ts \
  --scenario=extract-structure \
  --models=gemini-flash-latest,glm-5.2,deepseek-v4-flash --reference=golden
```

Commit the JSON artifacts under `web/scripts/artifacts/` and paste the markdown
into the PR (this also satisfies the "PRs touching `web/lib/ai/**` must run the
comparison harness" rule).

## Results

_Fill in after the live run. Summarize per task: JSON-validity rate, L1 / role
agreement vs Gemini and vs golden, $/job and projected monthly cost (use the
spend report for volume), latency, and a per-task go/no-go recommendation._

| scenario | model | JSON ok | L1 / role agree | $/job | vs Gemini $/job | latency | verdict |
|---|---|---|---|---|---|---|---|
| extract-structure | gemini-flash-latest | — | (reference) | — | 1.0x | — | baseline |
| extract-structure | glm-5.2 | — | — | — | — | — | — |
| extract-structure | deepseek-v4-flash | — | — | — | — | — | — |
| categorize | … | | | | | | |

## Grounded tasks (not covered here)

`analyzeJobAdvanced` (hot path) and `performDeepResearch` (company research) rely
on Gemini's built-in Google Search. Open models have no native equivalent. A
future evaluation could either (a) prefetch grounding once with Gemini and pass
identical `webSearchContext` to every candidate (isolating reasoning quality — the
param already exists), or (b) bolt on a dedicated search API (Tavily / Brave /
Exa). Neither is in scope for this pass.

## Constraints / honesty

- Sticker costs are estimates in `gemini-pricing.ts`; reconcile against a real
  Fireworks invoice before trusting absolute USD.
- Agreement-with-Gemini is not ground truth; the golden set is the correctness
  anchor.
- Open-model JSON reliability varies by host; JSON-validity rate is itself a
  reported metric, and the existing salvage/retry logic in `structure.ts` carries
  over to the eval path.
- Fireworks data-retention terms should be confirmed acceptable for job-posting
  text before a sustained run.
