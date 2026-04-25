# `web/lib/analysis` — agent context

This directory holds the AI-driven analysis modules. Some are on the live ingestion path; most are not. **Know which is which before you wire something new.** When in doubt: see [`docs/INGESTION_PIPELINE.md`](../../../docs/INGESTION_PIPELINE.md).

## Live ingestion path

These run for every new job posting after `collect`:

- **`structure.ts`** — `extractJobStructure` (Flash). Pulls structured fields out of the raw description. Called from `web/lib/jobs/processor.ts` via `extractAndUpdateStructure`, gated by `description_hash` to skip unchanged descriptions.
- **`advanced-strategic.ts`** — `analyzeJobAdvanced` (Pro + grounded). The single grounded call per job. Phase 3 dropped the duplicate `performWebSearch` pre-fetch; the main call already has `googleSearch` enabled. Callers that want shared grounding pass `webSearchContext` explicitly.

## Backfill / off-path (do not wire into ingestion)

- **`strategic.ts`** — `analyzeJob`. Legacy single-job analyzer with an 8000-char description cap. Backfill flows only. Don't assume that cap applies to production.
- **`categorizer.ts`** — `categorizePosting`. Backfill role categorization. Function categories live in `function-categories.ts` (7 groups; see `getCategoryGroup`, `CATEGORY_GROUPS`).

## Company-level analysis (scheduled, not per-job)

- **`company-research.ts`** — `detectCompanyType`, `performDeepResearch`. Uses Pro + grounding to build company background context. Called from the `company-insights` GitHub Actions cron, not from per-job ingestion.
- **`company-insights.ts`** — Generates the long-form per-company narrative used on the company detail page. Fed by `company-research.ts` and historical context.
- **`company-news.ts`** — Lighter news-feed builder for the company page.

## Digest pipeline

- **`digest.ts`** — Builds the weekly digest payload. Consumed by the email template and the in-app `DigestViewer`. User-facing → voice directive applies.

## Helpers (not entry points)

- **`context-builder.ts`** — Aggregates historical context (`buildHistoricalContext`, `buildExtendedHistoricalContext`, hiring trends, executive hires, department breakdowns). Pure SQL + transformation; no AI calls. Feeds the analyzers above.
- **`strategic-context.ts`** — Strategic narrative scaffolding shared across analyzers.
- **`strategy-alignment.ts`** — Aligns extracted job signals to a company's stated strategy.
- **`role-themes.ts`** — Theme rollup used by digests.
- **`source-scoring.ts`** — Heuristic source-quality ranking for grounded results.
- **`function-categories.ts`** — The 7-group function taxonomy. Pure data; no AI.
- **`index.ts`** — Public re-exports. Update when you add a public function.

## Rules of the road

- Every Gemini call must write to `gemini_usage_events`. See [`docs/AI_HYGIENE.md`](../../../docs/AI_HYGIENE.md).
- Don't add a third grounded call per job. The hot path is **two** AI calls (Flash extract + Pro analyze).
- PRs touching this directory MUST run `gemini-compare.ts` and attach the markdown report to the PR description.
- User-facing surfaces (digest, company insight) get the voice directive from `web/lib/ai/voice.ts`. Internal extraction (`structure.ts`, `categorizer.ts`) does not.
