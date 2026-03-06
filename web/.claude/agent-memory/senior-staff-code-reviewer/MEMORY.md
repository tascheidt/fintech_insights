# Senior Staff Code Reviewer -- Memory

## Project: Fintech Talent Brief

### AI Model Convention
- All Gemini calls MUST use `gemini-3-flash-preview` or `gemini-pro-latest`
- Found violation in `lib/ai/tech-stack-extraction.ts` using `gemini-flash-latest` (invalid)
- Pro model is used only when web search/grounding is needed

### Silver Layer Pattern
- Per-job `tech_stack: string[]` is extracted during ingestion via `lib/analysis/structure.ts`
- Stored in `job_postings.tech_stack` (JSONB with GIN index)
- Already aggregated in `lib/analysis/digest.ts:getTopTech()` for weekly digests
- Company-level tech stack in `lib/ai/tech-stack-extraction.ts` duplicates this work with a separate Gemini call

### Error Handling Anti-Pattern
- `tech-stack-extraction.ts` catches all batch errors and continues, returning empty results on total failure
- API route returns 201 for empty results, making failures look like success
- This pattern (silent catch + continue) should be flagged anywhere it appears

### Job System -- Stuck Jobs (diagnosed 2026-03-06)
- See `job-system-issues.md` for detailed findings
- Root cause: no guaranteed-terminal-status invariant in runner/processor
- `executeCollectionJob` and `executeAnalysisJob` throw after setting `running` without catch to set `failed`
- Cron resume logic picks up stale `running` jobs, creating infinite loop
- `processCollectionTask` catch block re-throws without defensive task status update
- GitHub Actions offload leaves tasks `running`; cleanup cron NOT in vercel.json
- Final status logic deliberately sets job to `running` for offloaded tasks
- `triggerAnalysisJobIfNeeded` fires executeAnalysisJob with `.catch(console.error)` -- no status cleanup

### Job Tracking
- All cron/manual jobs tracked in `job_runs` table (not deprecated `cron_logs`)
- Valid job_types: collect, analyze, report, company-insights, insight-generation

### Cron Constraint
- Max 2 cron jobs per CLAUDE.md; currently at: daily collect (6 AM), weekly report (Mon 6 AM)
- `cleanup-jobs` cron exists at `/api/cron/cleanup-jobs/route.ts` but is NOT in vercel.json
- `company-insights` cron exists but is NOT in vercel.json
- Cleanup logic should be folded into collect cron to respect 2-cron limit
