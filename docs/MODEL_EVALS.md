# Model evals — the "new model came out" runbook

How we decide, with evidence, whether a new Gemini model should replace the one a
surface runs on today. Built Nov 2026 for the Gemini 4 (Argon / Hydrogen / Carbon)
launch; meant to be re-run every time Google ships or rotates a model.

The rules this enforces live in [`AI_HYGIENE.md`](./AI_HYGIENE.md); the older,
narrower tools it supersedes for model decisions are `gemini-compare.ts` (cost
baseline per scenario, still required on `lib/ai/**` PRs) and `model-bakeoff.ts`
(open-model extraction bake-off, [`OPEN_MODEL_EVALUATION.md`](./OPEN_MODEL_EVALUATION.md)).

## The loop

1. **Detect.** `model-watch.yml` (Mon 07:00 UTC) diffs the live catalog and what
   every `-latest` alias / production model actually serves against
   `web/scripts/fixtures/gemini-model-catalog.json`. A change opens one GitHub
   issue labelled `model-watch`. It never changes a model itself.
2. **Evaluate.** Run the suite with the new ids as candidates (below). Locally, or
   Actions → **Model Eval** → Run workflow (manual only; uploads the artifact).
3. **Decide per surface** using the gates below. Different surfaces can land on
   different models — that is the point of `SURFACE_MODELS`.
4. **Ship** (checklist below) and **record the decision** at the bottom of this file.
5. **Accept the catalog**: `npx tsx --env-file=.env.local scripts/model-watch.ts --update`,
   commit the snapshot, close the issue.

## Running it

```bash
cd web
# Plan only (no API calls): surfaces × cases × baseline
npx tsx scripts/model-eval.ts --dry-run

# Full run: candidates vs production on every surface, two judges
npx tsx --env-file=.env.local scripts/model-eval.ts \
  --models=<candidate-a>,<candidate-b> \
  --judges=<strongest-model>,<second-judge>

# Cheap smoke: two cases per surface, skip the grounded ones
npx tsx --env-file=.env.local scripts/model-eval.ts --models=<id> --limit=2 \
  --skip=job-analysis,company-research,company-news
```

Writes `web/scripts/artifacts/model-eval-<date>-<sha>.{json,md}`. Commit both in the
PR that acts on the result and paste the `.md` into the PR description (this
satisfies the `lib/ai/**` "attach a comparison report" rule).

No DB access is needed: every input comes from committed fixtures, and telemetry
rows are not written (`GEMINI_TELEMETRY_DISABLED=1`; usage is captured in-process).

## What it measures

Each surface in `MODEL_SURFACES` (`web/lib/ai/prompt-config.ts`) runs its **real
production function** — same prompt, parsing, retries — via the eval-only
`setEvalModelOverride` seam. The production model (`SURFACE_MODELS[surface]`) is
always the baseline. Per surface × model:

| Signal | What it is | Where it comes from |
|---|---|---|
| **ok** | Cases that produced output from a successful call. A fallback returned after every API call failed counts as a failure. | runner |
| **Deterministic scores** | Correctness where a right answer exists: hand-labeled golden extraction (24 jobs), Prompt Forge's curated digest / tech-stack benchmarks, public/private accuracy, schema completeness, coverage. | `scripts/model-eval/surfaces.ts` |
| **Agreement vs production** | Decision stability (same triage verdict, same analysis category…). Useful, **not** correctness. | `agreement` per surface |
| **Voice warnings** | `checkVoice` heuristics on user-facing text. | `lib/ai/voice-validator.ts` |
| **Judge win-rate** | Pairwise judge, candidate vs production on the same input, **run in both orders**; a win counts only if both orders agree. Ties = ½. Also counts "major issues" (fabrication, truncation, wrong format). | `lib/ai/eval/judge.ts` |
| **Cost / tokens / latency** | Input, output **and thinking** tokens; $/case from `gemini-pricing.ts`; p50/p95 latency. | usage observer |
| **Served as** | The concrete `modelVersion` each requested id answered with. | `lib/ai/model-catalog.ts` |

Fixtures (`scripts/model-eval/fixtures.ts`) are derived from committed data only —
the 24-job sample, its golden labels, the May 2026 Flash keywords for those jobs,
the feedback fixture, and the Prompt Forge benchmarks. Company-level surfaces get a
deliberately thin context (3 postings, no external research): the right behaviour
there is calibrated uncertainty, and the judge rubric says so.

### The golden extraction set

`web/scripts/fixtures/golden-extraction.json` (24 records) is hand-labeled from
exactly what the extractor sees — title plus the first 6,000 characters of the
description; the ATS location field is **not** in the prompt, so it is not in the
labels either. Each record has an `expected` answer, `acceptable` alternatives for
genuinely ambiguous fields, and tech split into `tech_required` (must appear;
arrays are synonyms) and `tech_allowed` (borderline, not penalized). Anything
else in a model's `tech_stack` — Jira, Slack, Excel, inferred tech — costs
precision, matching the prompt's own exclusion rules. Scored by
`scoreAgainstGolden` (`lib/ai/eval/agreement.ts`).

Known limits: 24 jobs; seniority / department / function saturate near 100% for
any competent model, so the set mainly discriminates on salary, location and
tech precision. Extend it with harder cases rather than loosening it.

## Decision gates

The report prints a mechanical verdict per surface (BETTER / PARITY / MIXED /
WORSE + cost delta). Use it as the starting point, then apply judgment:

1. **Reliability is a hard gate.** Any drop in `ok` on a hot-path surface
   (`job-structure`, `job-analysis`) blocks the switch.
2. **Correctness beats preference.** Where a deterministic correctness metric
   exists, a drop > 0.03 blocks the switch regardless of the judge.
   `job-structure` additionally keeps the historical **≥ 0.95 golden L1** bar.
3. **Judged surfaces need ≥ 50% win-rate from every judge** (parity or better),
   and no increase in candidate major issues.
4. **Cost.** A cheaper model at parity is a win. A pricier model needs a judged
   win-rate > 60% or a correctness gain on a surface where quality is the
   product (insight, editorial, job analysis) — not on internal plumbing.
5. **Grounded surfaces** (`job-analysis`, `company-research`, `company-news`) are
   noisy run-to-run; prefer two runs before switching them.

### Known biases — read before trusting a number

- **Self-preference.** A judge tends to favour its own family/outputs. When a
  judge is also a candidate, require the *other* judge to agree.
- **Position bias** is cancelled by the double-order design; the report counts
  how often the two orders disagreed (`positionSensitive` in the JSON).
- **Small n.** 2–24 cases per surface. Treat differences under ~10 points of
  win-rate as noise; read the raw outputs in the JSON for the surfaces you
  change.

## Alias or pinned?

Both are allowed (policy table in [`AI_HYGIENE.md`](./AI_HYGIENE.md) → "Model-ID policy"); preview / experimental / dated-snapshot IDs never are. Choose per surface:

- **Alias** when the surface is low-stakes and you want free upgrades (extraction plumbing, classification) — and accept that cost can move without a PR.
- **Stable versioned ID** when the output *is* the product (insight, editorial, digest, job analysis) or when no alias maps to the model you evaluated — behaviour only changes when a PR changes it. Model Watch flags its retirement.

## Shipping a model change

- [ ] Add the model id to `AI_MODEL_OPTIONS` (`web/lib/ai/prompt-config.ts`) if new.
- [ ] Change the surface's line in `SURFACE_MODELS`. Hot-path tier handles
      (`PRO_MODEL` / `FLASH_MODEL`) move only if every surface on them moves.
- [ ] **Prompt Forge surfaces** (`job-structure`, `tech-stack`, `weekly-digest`)
      read a stored `system_settings` row that wins over code. Add a migration that
      rewrites the stored `model` (pattern: `20260419120000_gemini_alias_migration.sql`).
      Removing an id from `AI_MODEL_OPTIONS` without this makes stored rows fail
      validation and **silently fall back to the code default, discarding admin-tuned prompts**.
- [ ] Add/verify the model's rate in `gemini-pricing.ts` (unknown models price at $0
      and blind the cost alarm). Reconcile against the GCP SKU export after a week.
- [ ] Check request-shape compatibility (thinking controls, temperature, grounding) —
      `extractJobStructure` sends `thinkingBudget: 0` and degrades once on rejection;
      watch `err calls` in the report.
- [ ] Commit the eval artifacts, update this file's decision record, `AI_HYGIENE.md`
      (approved models), `web/lib/ai/CLAUDE.md`, `releases.json` + version.
- [ ] After deploy: watch `gemini_usage_events` by `model_served` and the daily cost
      alarm for a week.

## Decision record

<!-- Newest first. One entry per eval-driven change (or explicit no-change). -->

_Pending: Gemini 4 (Argon / Hydrogen / Carbon) evaluation, Nov 2026._
