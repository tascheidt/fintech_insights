# Senior Staff Code Reviewer -- Memory

## Project: Fintech Talent Brief

### Review-blocking patterns from May 2026 incidents

- **Unit tests that pin buggy assumptions.** The Workday URL builder shipped with a `/job`-doubling bug because `workday-utils.test.ts` *asserted* the buggy output — vitest stayed 100% green while every production detail call returned 406 for weeks. When reviewing a fixture-based test for a scraper / parser / URL builder, ask: "does this just lock in whatever the implementation currently does, or does it cross-check against an independent source of truth?" If only the former, push back.
- **"It's bot detection" without wire-level evidence.** Three hours and a 60-line cookie/header machine in PR #81 were spent on a misdiagnosed Workday 406 that was a one-character URL bug. Rule of thumb: if the proposed fix is "add more headers to defeat bot detection," demand a `curl` against the failing URL with the simplest possible headers first. If bare `Accept: application/json` works, it's not bot detection.
- **Gemini call site missing thoughts-token billing.** Gemini 2.5 returns reasoning tokens billed at the output rate. `gemini-meter.ts#recordUsage` infers them from the `totalTokenCount` residual if the SDK doesn't surface the named field. Any new Gemini call site that constructs its own usage record (not going through `recordUsage`) is undercounting cost — block the PR.
- **Tier/role page variants that drop blocks silently.** When `{isIncumbent ? <Variant /> : <Original />}` ships, the new branch often skips conditional render blocks from the original by oversight, not design. Phase 2's incumbent variant of `companies/[slug]/page.tsx` dropped the `latestInsight` rendering entirely — RBC insights silently went nowhere. When reviewing a branched render, list every conditional block in the original and verify each is keep/drop/replace **explicitly**.

### AI Model Convention (updated 2026-04-19)
- All Gemini calls MUST use floating `-latest` aliases: `gemini-flash-latest`, `gemini-flash-lite-latest`, `gemini-pro-latest`.
- Never pin a versioned or preview ID (`gemini-3-flash-preview`, `gemini-2.0-flash`, etc.).
- Model strings must resolve through `AI_MODEL_OPTIONS` in `web/lib/ai/prompt-config.ts` — anything outside that Zod enum fails validation. Flag hardcoded strings that bypass it.
- Pro model is used only when web-search grounding is load-bearing.

### Mandatory Gemini telemetry (Phase 5, 2026-04-19)
- Every new Gemini call-site MUST build a `UsageRecord` via `recordUsage` from `web/lib/ai/gemini-meter.ts` and pass it to `writeUsageEvent` from `web/lib/ai/gemini-telemetry.ts`. Writes are fire-and-forget into `gemini_usage_events`.
- Propagate an optional `onUsage` observer alongside the DB write for scripts that run the same function in a `gemini-compare.ts` scenario.
- Flag any `generateContent` call without these two alongside. Reference implementations: `structure.ts#extractJobStructure`, `advanced-strategic.ts#analyzeJobAdvanced`, `advanced-strategic.ts#performWebSearch` (they also pull `usageMetadata` from `stream.response` in the streaming chat path).

### Grounding discipline (Phase 3 lesson, 2026-04-19)
- Before approving a new `googleSearch`-enabled call, confirm the upstream caller is not already grounding. The Apr 2026 incident was `analyzeJobAdvanced` firing a pre-fetch grounded call PLUS the main grounded call — duplicate work, doubled per-job cost.
- Grounding surcharge is ~$0.035/request regardless of token count. Two grounded calls per logical operation is nearly always a smell.

### Live ingestion path (sacred)
```
processor.ts → [description_hash gate] → extractAndUpdateStructure → extractJobStructure (Flash)
analyzer.ts → analyzeJobAdvanced (Pro+grounded; in-flight grounding, no pre-fetch)
```
Do NOT add wiring into `analyzeJob` in `strategic.ts` or `categorizePosting` in `categorizer.ts` — both are dead code on the live ingestion path (legacy/backfill only). Anyone wiring them in needs to justify it explicitly.

### Dead code to beware of
- `strategic.ts#analyzeJob` — exported, never called in production
- `categorizer.ts#categorizePosting` — only in `scripts/backfill-function-category.ts`
- The 8000-char description cap in `strategic.ts` DOES NOT apply to the live `advanced-strategic.ts#analyzeJobAdvanced` path. Flag anyone citing it as a production constraint.

### Silent Pro→Flash fallback
- `advanced-strategic.ts:467-485` silently swaps Pro→Flash on quota errors. `gemini_usage_events.model_served` exposes when this fires — `WHERE model_requested <> model_served` surfaces it. Flag any new analysis function that logs only `modelRequested` without also recording `modelServed`.

### Quality testing thresholds (Phase 3 & 4 plan-of-record)
- For `analyze-advanced` optimizations: L1 agreement on `is_new_direction`, `is_executive_movement` must be ≥90%. `category` is a soft taxonomy field and below-threshold shifts (70% on Phase 3) can be accepted with explicit documentation of the reclassifications.
- For `extract-structure` optimizations: L1 agreement on `function_category`, `seniority_level`, `standardized_department` must be ≥95%. Phase 4 Flash-Lite evaluation failed this bar (80%) and was NOT routed — hard "no" precedent for blind-swapping extract models.
- L2 voice-validator delta must not regress by >2pp.
- Voice warnings are post-hoc regex checks from `lib/ai/voice-validator.ts` — not a substitute for human judgment on `insight_summary` tone.

### Cache-key invariant
- Any response cache (present or future, e.g. company-insight cache envisioned in the plan) MUST include `prompt_config_version` in the key. Otherwise a prompt tweak silently serves stale outputs forever. Flag cache keys that only hash inputs.

### Voice-directive placement
- The ~140-token voice block from `web/lib/ai/voice.ts` is mandatory on user-facing surfaces (digest, company insight, chat, narrative) and forbidden on internal extraction/classification prompts (extraction output is never shown to users). Flag voice blocks leaking into extraction prompts.

### Measurement-first convention
- PRs touching `web/lib/ai/**` or `web/lib/analysis/**` must run `gemini-compare.ts` and attach the markdown report. Reference diff tools: `diff-analyze-artifacts.ts` (L1+L2+cost), `diff-extract-artifacts.ts` (L1+partial-extraction), `project-hash-gate-savings.ts` (projection vs baseline).
- Committed baselines in `web/scripts/artifacts/` are the reference points. Do not regenerate the fixture casually — it's seeded annually.

### Silver Layer Pattern
- Per-job `tech_stack: string[]` is extracted during ingestion via `lib/analysis/structure.ts`.
- Stored in `job_postings.tech_stack` (JSONB with GIN index).
- Aggregated in `lib/analysis/digest.ts:getTopTech()` for weekly digests.
- Company-level tech stack in `lib/ai/tech-stack-extraction.ts` duplicates this work with a separate Gemini call.

### Error Handling Anti-Pattern
- `tech-stack-extraction.ts` catches all batch errors and continues, returning empty results on total failure.
- API route returns 201 for empty results, making failures look like success.
- Flag the `try { ... } catch { continue; }` pattern wherever it appears without an accompanying null-rate counter or status propagation.

### Job System -- Stuck Jobs (diagnosed 2026-03-06)
- See `job-system-issues.md` for detailed findings.
- Root cause: no guaranteed-terminal-status invariant in runner/processor.
- `executeCollectionJob` and `executeAnalysisJob` throw after setting `running` without catch to set `failed`.
- Cron resume logic picks up stale `running` jobs, creating infinite loop.
- `processCollectionTask` catch block re-throws without defensive task status update.
- GitHub Actions offload leaves tasks `running`; cleanup cron NOT in vercel.json.
- Final status logic deliberately sets job to `running` for offloaded tasks.
- `triggerAnalysisJobIfNeeded` fires executeAnalysisJob with `.catch(console.error)` -- no status cleanup.

### Job Tracking
- All cron/manual jobs tracked in `job_runs` table (not deprecated `cron_logs`).
- Valid job_types: collect, analyze, report, company-insights, insight-generation.

### Cron Constraint
- Max 2 cron jobs per CLAUDE.md; currently at: daily collect (6 AM), weekly report (Mon 6 AM).
- `cleanup-jobs` cron exists at `/api/cron/cleanup-jobs/route.ts` but is NOT in vercel.json.
- `company-insights` cron exists but is NOT in vercel.json.
- Cleanup logic should be folded into collect cron to respect 2-cron limit.
