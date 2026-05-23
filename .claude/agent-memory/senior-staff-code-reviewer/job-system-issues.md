# Job System -- Stuck Jobs Analysis (2026-03-06)

## Files Reviewed
- `web/lib/jobs/runner.ts` -- job creation and execution
- `web/lib/jobs/processor.ts` -- collection task processing (scrape + ingest)
- `web/lib/jobs/analyzer.ts` -- analysis task processing
- `web/lib/jobs/progress.ts` -- progress tracking
- `web/lib/jobs/types.ts` -- type definitions
- `web/app/api/cron/collect/route.ts` -- cron entry point
- `web/app/api/cron/cleanup-jobs/route.ts` -- stale job cleanup (not deployed)
- `web/app/api/admin/trigger/route.ts` -- admin manual trigger
- `web/vercel.json` -- cron and function config

## Root Causes (ranked by impact)

1. **runner.ts:99,142** -- `executeCollectionJob` throws after setting `running`, no catch sets `failed`
2. **collect/route.ts:45-52** -- Cron resume picks up stale `running` jobs, creating infinite loop
3. **processor.ts:473-476** -- catch block re-throws without defensive task status update
4. **processor.ts:401-426 + vercel.json** -- GitHub Actions offload + cleanup cron not deployed
5. **runner.ts:146-150** -- Final status logic deliberately sets job to `running` for offloaded tasks

## Key Invariant Missing
Every function that sets `status: 'running'` MUST guarantee a terminal status on ALL exit paths.
Neither runner.ts nor processor.ts nor analyzer.ts enforce this.

## Fix Strategy
1. Add try/catch with `status: 'failed'` to executeCollectionJob, executeAnalysisJob
2. Add defensive catch to processCollectionTask, processAnalysisTask
3. Fold cleanup logic into collect cron as first step (respects 2-cron limit)
4. Fix resume query to exclude jobs older than maxDuration
5. Handle "no resumable tasks but offloaded tasks exist" gracefully
