# Open-Model Evaluation (open-weight candidates vs Gemini)

**Status:** harness landed; **Round 1 complete** (GLM-5.2 + DeepSeek V4-Flash on
the 24-job fixture, scored vs the Gemini baseline). **GLM-5.2 retired** — it was
strictly dominated on extraction (pricier than `gemini-flash-latest`, ~8x slower,
lower agreement). Round 2 candidates are queued (Qwen3-30B-A3B, Llama 4 Scout,
Mistral Small) and a **golden correctness set** is now authorable via the
labeler. **No production model default has changed.** This doc is the methodology
+ how-to-run + results.

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
| `qwen3-30b-a3b` (Fireworks) | ~$0.90 | ~$0.90 | **R2 lead** — 3B-active MoE, fast |
| `llama4-scout` (Fireworks) | ~$0.22 | ~$0.88 | R2 — Meta MoE, fastest on Groq |
| `mistral-small` (Fireworks) | ~$0.90 | ~$0.90 | R2 — dense 24B, extraction-tuned |
| `deepseek-v4-flash` (Fireworks) | $0.14 | $0.28 | cheapest; backfill-only (slow) |
| `glm-5.2` (Fireworks) | $1.20 | $4.10 | **RETIRED** (dominated, R1) |

The headline prize is **extraction**: highest volume, no grounding, mechanical
JSON. DeepSeek V4-Flash output is ~32x cheaper than Flash on a sticker basis —
*if* quality holds AND latency is acceptable. Round 1 showed the cheap big-MoE
candidates (DeepSeek, GLM) run **~13s/job** vs Gemini's ~1.7s — fine for backfill,
too slow for the per-job hot path. Round 2 prioritizes **small-active-param**
candidates (Qwen3-30B-A3B = 3B active; Mistral Small = dense 24B) precisely to
win latency, not just cost. See "Why Round 1 was slow" below.

## Decisions

- **Evaluation only.** Build the seam + harness, run the bake-off, write up the
  result. Migrate nothing in this work.
- **Candidates (R1, done):** GLM-5.2 (retired), DeepSeek V4-Flash (kept, backfill).
- **Candidates (R2, queued):** Qwen3-30B-A3B (lead), Llama 4 Scout, Mistral Small
  — chosen for **small active-param footprint** to fix the R1 latency problem.
- **Host:** Fireworks (US-based, OpenAI-compatible) — drop-in for the seam, keeps
  job text off China-direct endpoints. (Groq would serve Llama 4 Scout ~10x
  faster but needs a new `ProviderId` + client; deferred — see latency note.)
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
   human-verified set (~24-40 stratified jobs). Score every model, including
   Gemini, against it to measure **correctness**. Pass `--reference=golden`.
   Round-1 agreement was scored vs Gemini, so it cannot tell "candidate is wrong"
   from "Gemini is wrong" — and the worst fields (`function`, `keywords`) are the
   most subjective. The golden set is what makes Round 2 decision-grade.

   **Authoring the golden set — `scripts/golden-labeler.html`.** A self-contained
   browser tool (no server). Regenerate it with:

   ```bash
   cd web && npx tsx scripts/build-golden-labeler.ts   # writes scripts/golden-labeler.html
   open scripts/golden-labeler.html
   ```

   Each fixture job shows its description next to an edit form **pre-seeded from
   the latest bake-off's `gemini-flash-latest` output** (so you verify/correct,
   not type from blank): enum dropdowns for seniority + function, comma-separated
   tech/keywords, salary + location fields. Tick **Verified** per job (progress
   auto-saves to localStorage), then **Download** — it emits the exact
   `{records:[{jobId,expected}]}` shape. Move it to
   `scripts/fixtures/golden-extraction.json`. Only Verified rows are exported, so
   a partial pass is fine. A `categorize` golden set lives at
   `golden-categorize.json` (same `--reference=golden` flag; author by hand for now).

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

# 1. Extraction bake-off (highest-value, lowest-risk). R2 candidate set.
npx tsx --env-file=.env.local scripts/model-bakeoff.ts \
  --scenario=extract-structure \
  --models=gemini-flash-latest,qwen3-30b-a3b,llama4-scout,mistral-small

# 2. Categorization bake-off.
npx tsx --env-file=.env.local scripts/model-bakeoff.ts \
  --scenario=categorize \
  --models=gemini-flash-latest,qwen3-30b-a3b,llama4-scout,mistral-small

# 3. (After authoring the golden set) score correctness, not just similarity.
#    Author it first: npx tsx scripts/build-golden-labeler.ts && open scripts/golden-labeler.html
npx tsx --env-file=.env.local scripts/model-bakeoff.ts \
  --scenario=extract-structure \
  --models=gemini-flash-latest,qwen3-30b-a3b,deepseek-v4-flash --reference=golden
```

Before running R2, confirm each candidate's live Fireworks slug on its model
page; if it has rotated, set the matching `FIREWORKS_*` override in `.env.local`
(the registry entries name the env var). An unknown slug fails the call, not the
whole run.

Commit the JSON artifacts under `web/scripts/artifacts/` and paste the markdown
into the PR (this also satisfies the "PRs touching `web/lib/ai/**` must run the
comparison harness" rule).

## Results

### Round 1 (2026-06-21, sha `7b01798`, fixture=24, reference=`gemini-flash-latest`)

Agreement is **vs Gemini**, not golden — similarity, not correctness. Read it as
"how far each candidate drifts from current production," not "how wrong it is."

| scenario | model | JSON ok | L1 / role agree | $/1k jobs | vs Gemini | latency | verdict |
|---|---|---|---|---|---|---|---|
| extract-structure | gemini-flash-latest | 100% | (reference) | $5.77 | 1.0x | 1.7s | baseline |
| extract-structure | glm-5.2 | 100% | 81.2% L1 | $7.75 | **1.34x** | 14.3s | ❌ **RETIRED** — dominated |
| extract-structure | deepseek-v4-flash | 100% | 76.8% L1 | $0.63 | 0.11x | 13.4s | ⚠️ cheap, slow, off-baseline |
| categorize | gemini-flash-latest | 100% | (reference) | $19.26 | 1.0x | 7.4s | baseline |
| categorize | glm-5.2 | 100% | 83.3% role | $9.15 | 0.48x | 16.9s | ❌ retired |
| categorize | deepseek-v4-flash | 100% | 70.8% role | $0.65 | 0.03x | 12.5s | ⚠️ 30x cheaper, weakest agreement |

**Reads:**
- **GLM-5.2 retired.** On extraction it costs *more* than Gemini, runs 8x slower,
  and agrees less. No surviving use case.
- **Disagreement is concentrated, not diffuse.** seniority/dept/salary are
  ~95-100%; the gap is entirely `function` (62-70%), `keywords` (32-46%), and
  `summary` (43-47%). The `keywords` Jaccard is partly a set/ordering artifact.
  This is *exactly* the pattern where Gemini-as-reference is unreliable — those
  are the subjective fields. Hence the golden set before any verdict.
- **Latency, not cost, is the hot-path blocker.** Both cheap candidates are
  ~13-14s/job vs Gemini's 1.7s. DeepSeek's 30x cost win is real but only matters
  where latency doesn't — **backfill `categorize`**, never per-job ingest.
- Two `salary.min` validation failures (a float where the schema wanted int)
  were a harness/schema bug, not model quality — **fixed** (`structure.ts`
  rounds salary floats now).

### Why Round 1 was slow (and what R2 fixes)

The ~13s wall-clock was **output-token-count × per-token decode on a giant MoE**,
not time-to-first-token. DeepSeek-V4-Flash is a 284B-total / 13B-active MoE; GLM
is similarly large-total. Big total-param MoEs pay all-to-all expert-routing +
memory-bandwidth cost *per decoded token*, so single-stream short-output decode
sees the worst of MoE — the latency advantage only shows up under heavy batching.

R2 attacks this directly: **Qwen3-30B-A3B** is 3B-active / 30B-total (an order of
magnitude smaller footprint), **Mistral Small** is dense 24B (no routing
overhead), and **Llama 4 Scout** is cheap and JSON-capable (and ~447 t/s if we
later add a Groq provider). Also: output length is the dominant lever — keep
`max_tokens` capped and the JSON schema lean regardless of winner.

### Round 2

_Pending live run. Author the golden set first, then score correctness (not just
Gemini-similarity) for the R2 candidates + DeepSeek + Gemini in one table._

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
