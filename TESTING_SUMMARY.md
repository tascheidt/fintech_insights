# Job Processing Testing Summary

## Code Verification ✅

All code changes have been verified using automated checks:

- ✅ GitHub Actions workflow accepts `task_id` parameter
- ✅ `github.ts` passes `taskId` to workflow trigger
- ✅ `processor.ts` passes `taskId` when triggering GitHub Actions
- ✅ `scrape-heavy.ts` handles `TASK_ID` and updates existing tasks
- ✅ Process API route has deduplication logic
- ✅ Cleanup cron endpoint exists and handles stale jobs
- ✅ `ProcessButton` has timeout and cancel functionality
- ✅ Error handling marks jobs as failed

**Run verification**: `cd web && npx tsx scripts/verify-code-changes.ts`

## Manual Testing Required

Since the application is deployed on Vercel, you'll need to test manually with the actual companies in your database. Based on the screenshot, these companies are active:

### Companies to Test

1. **EQ Bank** (lever) - API scraper
2. **Koho** (ashby) - Browser scraper (GitHub Actions)
3. **Monzo** (greenhouse) - API scraper
4. **Neo Financial** (ashby) - Browser scraper (GitHub Actions)
5. **Tangerine** (custom) - Browser scraper
6. **Wealthsimple** (lever) - API scraper

### Testing Checklist

#### ✅ Test 1: API Scraper (Lever/Greenhouse)
- [ ] Process EQ Bank or Wealthsimple
- [ ] Verify job completes successfully
- [ ] Check status badge shows "Completed"
- [ ] Verify no GitHub Actions triggered

#### ✅ Test 2: Browser Scraper (Ashby) - Critical
- [ ] Process Koho or Neo Financial
- [ ] Verify GitHub Actions workflow is triggered
- [ ] Check workflow receives `task_id` input
- [ ] Verify **original task is updated** (not new task created)
- [ ] Verify task completes when GitHub Actions finishes

#### ✅ Test 3: Deduplication
- [ ] Click Process twice quickly for same company
- [ ] Verify second click returns "already_running"
- [ ] Verify only ONE job_run exists
- [ ] Verify UI shows same jobRunId

#### ✅ Test 4: Error Handling
- [ ] Trigger processing with invalid company (if possible)
- [ ] Verify job marked as "failed"
- [ ] Verify error message stored
- [ ] Verify UI shows error

#### ✅ Test 5: Client Timeout
- [ ] Start processing browser scraper
- [ ] Wait 10+ minutes (or reduce timeout for testing)
- [ ] Verify timeout warning appears
- [ ] Verify cancel button works

#### ✅ Test 6: Cleanup Cron
- [ ] Manually create stale job (35+ minutes old)
- [ ] Trigger `/api/cron/cleanup-jobs` endpoint
- [ ] Verify stale job marked as "failed"
- [ ] Verify error message contains "timed out"

## Quick Test Commands

### Check running jobs for a company:
```sql
SELECT jr.id, jr.status, jrt.id as task_id, jrt.status as task_status, jrt.started_at
FROM job_runs jr
JOIN job_run_tasks jrt ON jrt.job_run_id = jr.id
WHERE jr.company_id = '<company_id>'
ORDER BY jr.started_at DESC
LIMIT 5;
```

### Check for stale jobs:
```sql
SELECT jr.id, jr.status, jrt.id as task_id, jrt.status, jrt.started_at,
       EXTRACT(EPOCH FROM (NOW() - jrt.started_at))/60 as minutes_running
FROM job_runs jr
JOIN job_run_tasks jrt ON jrt.job_run_id = jr.id
WHERE jrt.status = 'running'
  AND jrt.started_at < NOW() - INTERVAL '30 minutes'
ORDER BY jrt.started_at;
```

### Trigger cleanup manually:
```bash
curl -X GET "https://your-app.vercel.app/api/cron/cleanup-jobs" \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Expected Behavior Summary

### Before Fixes ❌
- Browser scrapers created orphan tasks (original task stayed "running" forever)
- No deduplication (multiple jobs could run simultaneously)
- No timeout detection (jobs could run indefinitely)
- Poor error handling (failed jobs not marked as failed)

### After Fixes ✅
- Browser scrapers update existing tasks (no orphans)
- Deduplication prevents duplicate jobs
- Cleanup cron marks stale jobs as failed after 30 minutes
- Client timeout warns after 10 minutes
- All errors properly handled and marked as failed

## Files Changed

1. `web/lib/github.ts` - Added `taskId` parameter
2. `web/lib/jobs/processor.ts` - Passes `taskId` to GitHub trigger
3. `web/scripts/scrape-heavy.ts` - Updates existing tasks instead of creating new
4. `.github/workflows/scrape-heavy.yml` - Accepts `task_id` input
5. `web/app/api/companies/[id]/process/route.ts` - Added deduplication and error handling
6. `web/app/api/cron/cleanup-jobs/route.ts` - **New file** - Stale job cleanup
7. `web/vercel.json` - Added cleanup cron schedule
8. `web/components/companies/ProcessButton.tsx` - Added timeout and cancel

## Next Steps

1. Deploy changes to Vercel
2. Test with each company type (API vs Browser scraper)
3. Monitor GitHub Actions workflows for browser scrapers
4. Verify cleanup cron runs every 15 minutes
5. Check database for any stuck jobs after 24 hours
