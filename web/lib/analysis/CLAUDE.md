# `web/lib/analysis` — agent context

This directory holds the AI-driven analysis modules. Some are on the live ingestion path; most are not. **Know which is which before you wire something new.** When in doubt: see [`docs/INGESTION_PIPELINE.md`](../../../docs/INGESTION_PIPELINE.md).

## Live ingestion path

These run for every new job posting after `collect`:

- **`structure.ts`** — `extractJobStructure` (Flash, `thinkingBudget: 0` — reasoning tokens are pure waste on mechanical JSON extraction; ~72% per-call cost cut). Pulls structured fields out of the raw description. Called from `web/lib/jobs/processor.ts` via `extractAndUpdateStructure`, gated by a **normalized** `description_hash` (`normalizeDescriptionForHash` strips volatile boilerplate so unchanged postings skip the call). Evaluated against Flash-Lite in 2026-05 and **kept on Flash** (failed the ≥95% L1 gate). Carries an **eval-only seam**: when handed an eval model id (e.g. `glm-5.2`) the generate step routes to the OpenAI-compatible provider; a Gemini id (the production default) runs the existing Gemini path unchanged. See [`docs/OPEN_MODEL_EVALUATION.md`](../../../docs/OPEN_MODEL_EVALUATION.md).
- **`advanced-strategic.ts`** — `analyzeJobAdvanced` (Pro + grounded). The single grounded call per job. Phase 3 dropped the duplicate `performWebSearch` pre-fetch; the main call already has `googleSearch` enabled. Callers that want shared grounding pass `webSearchContext` explicitly.

## Backfill / off-path (do not wire into ingestion)

- **`strategic.ts`** — `analyzeJob`. Legacy single-job analyzer with an 8000-char description cap. Backfill flows only. Don't assume that cap applies to production.
- **`categorizer.ts`** — `categorizePosting`. Backfill role categorization. Function categories live in `function-categories.ts` (7 groups; see `getCategoryGroup`, `CATEGORY_GROUPS`). Now writes a `gemini_usage_events` row like every other call site (it previously had none), and carries the same eval-only model seam as `structure.ts`.

## Company-level analysis (scheduled, not per-job)

- **`company-research.ts`** — `detectCompanyType`, `performDeepResearch`. Uses Pro + grounding to build company background context. Called from the `company-insights` GitHub Actions cron, not from per-job ingestion.
- **`company-insights.ts`** — Generates the long-form per-company narrative used on the company detail page. Fed by `company-research.ts` and historical context.
- **`company-editorial.ts`** — `generateCompanyEditorial`, `applyEditorialToCompany`. Pro (ungrounded) call that produces the v2 editorial fields stored on `companies` (thesis / thesis_sub / interpretation / last_change / bets). Reuses the most recent `company_insights` row as background context so it does not stack a second grounded call. Telemetered via `gemini_usage_events`. Refreshed by `web/scripts/regenerate-editorial.ts` and the `editorial-cron.yml` GH Actions workflow (Mondays 11:00 UTC). Retries transient failures (timeout / empty / malformed JSON) up to 3 attempts with linear backoff — a single 120s Pro stall hard-failed the weekly cron on July 13 2026; each attempt writes its own telemetry row.
- **`cross-company-themes.ts`** — `refreshAllThemeLabels` (Flash, ungrounded). Author-quality labels for the function-group rollups on the Jobs right rail (e.g. "Real-time payments rails"). Cached in `cross_company_themes`; invalidated by keyword-bag hash. Refreshed alongside the editorial cron. Same 3-attempt retry + fence-aware JSON salvage as the other narrative call sites (the July 13 2026 run died on one unparseable Flash response); `maxOutputTokens` 4096 for truncation headroom.
- **`bet-suggester.ts`** — Pure rule-based candidate generator (no AI). Surfaces 1–4 candidate bets to the editor based on pivot classification + keyword bursts. Surfaced via `EditCompanyEditorialForm`'s "Suggest from hiring data" button.
- **`company-news.ts`** — Lighter news-feed builder for the company page.

## Feedback triage (event-driven, not per-job)

- **`feedback-triage.ts`** — `triageFeedback` (Pro, ungrounded). Classifies an incoming `feedback_submissions` row and drafts the GitHub issue markdown an admin ships from. Everything except the Gemini call is pure and unit-tested: `enforceTriagePolicy`, `sanitizeDuplicate`, `clampConfidence`, `parseTriageJson`, `buildTriagePrompt`. Internal classification → **no voice directive**; `triage_reasoning` is admin-facing and must never be rendered to the submitting user.
  - **Two rubrics.** `DEFECT_TYPES` (`bug`) gets a defect rubric that asks about specificity and blast radius and can never decline on roadmap-priority grounds; everything else gets the product-prioritization rubric. A single rubric is what let a scraper outage be judged as an unprioritized feature.
  - **Duplicates are links, never verdicts.** Candidates carry real UUIDs (shortlisted by the `feedback_duplicate_candidates` trigram RPC, declines included), a returned id is dropped unless it was in the candidate set, and a duplicate link alone can never produce a `no`.
- **`feedback-triage-runner.ts`** — the Supabase-facing half: loads the submission and candidates, runs the engine, persists. Called by `POST /api/internal/feedback/triage` (CRON_SECRET-guarded), which `POST /api/feedback` invokes fire-and-forget via the `onSubmissionCreated` hook.

Replaced an out-of-tree Supabase Edge Function; the full rationale is in [`docs/FEEDBACK_PIPELINE.md`](../../../docs/FEEDBACK_PIPELINE.md).

## Digest pipeline

- **`digest.ts`** — Builds the weekly digest payload. Consumed by the email template and the in-app `DigestViewer`. User-facing → voice directive applies. Editorial v2 (Jul 2026): per-company summaries get a `{previous_weeks}` serial-memory block (last 4 stored digests) and return an extra `new_signal` sentence for the "Signals" section; the lede is AI-written (`generateGlobalSummaryCommentary`, Flash ungrounded, telemetered) with the deterministic `buildGlobalSummary` as fallback. Both AI calls are failure-safe — history-lookup or lede failure never fails the digest. See [`docs/WEEKLY_DIGEST_EMAIL_ARCHITECTURE.md`](../../../docs/WEEKLY_DIGEST_EMAIL_ARCHITECTURE.md). `buildIncumbentWatch` is gated by the `incumbent_tracking_enabled` flag (`web/lib/settings/incumbent-tracking.ts`) — when incumbent tracking is off (the default) it returns `null`, which is the existing "no qualifying hire" contract, so the email + viewer omit the block with no further change. See root CLAUDE.md §7 "Incumbent-tracking flag".

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
- Read `companies` / `job_postings` through the `active_companies` / `active_job_postings` views, never the base tables — a deactivated company must not feed analysis or surface to users. Two independent `is_active` axes (company vs req); don't conflate them. Enforced by `design-system/active-company-scope`. See root CLAUDE.md §7.
