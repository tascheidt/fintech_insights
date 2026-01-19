# Manual Testing Guide for Job Processing Changes

This guide helps you test the job processing improvements manually through the UI and API.

## Prerequisites

1. Ensure the application is running (`npm run dev` in `/web`)
2. Ensure you're logged in as an editor or admin
3. Have access to the Supabase database

## Test Companies

Based on the image, these companies are in the system:
- **EQ Bank** (lever) - API scraper
- **Koho** (ashby) - Browser scraper  
- **Monzo** (greenhouse) - API scraper
- **Neo Financial** (ashby) - Browser scraper
- **Tangerine** (custom) - Browser scraper
- **Wealthsimple** (lever) - API scraper

## Test 1: API-Based Scraper Processing (Lever/Greenhouse)

**Goal**: Verify API scrapers complete successfully without GitHub Actions

1. Navigate to `/companies` page
2. Click "Process" for **EQ Bank** or **Wealthsimple** (lever) or **Monzo** (greenhouse)
3. **Expected behavior**:
   - Button shows "Processing..." with spinner
   - Progress bar appears showing scrape → ingest stages
   - Job completes within 1-2 minutes
   - Status badge shows "Completed (X new, Y updated)"
   - Page refreshes after 3 seconds
   - Browser notification appears (if permission granted)

**Verify in database**:
```sql
SELECT id, status, started_at, completed_at, new_jobs, updated_jobs 
FROM job_run_tasks 
WHERE company_id = '<company_id>' 
ORDER BY started_at DESC 
LIMIT 1;
```
Should show `status = 'completed'` with `completed_at` set.

## Test 2: Browser-Based Scraper Processing (Ashby)

**Goal**: Verify browser scrapers trigger GitHub Actions and update existing task

1. Navigate to `/companies` page
2. Click "Process" for **Koho** or **Neo Financial** (ashby)
3. **Expected behavior**:
   - Button shows "Processing..." with spinner
   - Status badge shows "Processing"
   - GitHub Actions workflow is triggered (check GitHub Actions tab)
   - Task stays in "running" state until GitHub Actions completes
   - When GitHub Actions finishes, task updates to "completed" or "failed"
   - Original task is updated (NOT a new task created)

**Verify in database**:
```sql
-- Check that only ONE task exists for this job run
SELECT jr.id, jr.status, COUNT(jrt.id) as task_count
FROM job_runs jr
LEFT JOIN job_run_tasks jrt ON jrt.job_run_id = jr.id
WHERE jr.company_id = '<company_id>'
  AND jr.trigger_type = 'manual'
ORDER BY jr.started_at DESC
LIMIT 1;

-- Check the task was updated (not created new)
SELECT id, status, started_at, completed_at, error_message
FROM job_run_tasks
WHERE company_id = '<company_id>'
ORDER BY started_at DESC
LIMIT 1;
```

**Verify GitHub Actions**:
- Go to GitHub repository → Actions tab
- Find "Heavy Scraper" workflow run
- Verify it received `task_id` input parameter
- Check workflow logs show "Updating existing task: <task_id>"

## Test 3: Job Deduplication

**Goal**: Verify clicking Process multiple times doesn't create duplicate jobs

1. Navigate to `/companies` page
2. Click "Process" for any company
3. **Immediately** click "Process" again (within 1 second)
4. **Expected behavior**:
   - First click starts processing
   - Second click returns immediately with "already_running" status
   - Only ONE job_run and task are created
   - UI shows same jobRunId for both clicks

**Verify in database**:
```sql
-- Should only have ONE running task
SELECT COUNT(*) as running_count
FROM job_run_tasks
WHERE company_id = '<company_id>'
  AND status = 'running';
```
Should return `1` (or `0` if completed).

**Verify in browser console**:
- Check Network tab for second POST request
- Response should include `status: 'already_running'`

## Test 4: Error Handling

**Goal**: Verify errors are properly handled and jobs marked as failed

1. Create a test scenario (e.g., invalid ATS identifier)
2. Trigger processing
3. **Expected behavior**:
   - Job fails gracefully
   - Task status = 'failed'
   - Error message stored in `error_message` field
   - Job run status = 'failed'
   - UI shows error message
   - Browser notification shows failure (if permission granted)

**Verify in database**:
```sql
SELECT status, error_message, error_stage, completed_at
FROM job_run_tasks
WHERE status = 'failed'
ORDER BY started_at DESC
LIMIT 1;
```

## Test 5: Client-Side Timeout

**Goal**: Verify timeout warning appears for long-running jobs

1. Start processing a browser-based scraper (which may take longer)
2. Wait 10+ minutes (or manually adjust timeout in code)
3. **Expected behavior**:
   - After 10 minutes, warning appears: "Job has been running for over 10 minutes..."
   - Cancel button (X) is available
   - Clicking cancel stops waiting but doesn't cancel server job
   - Job continues running on server

**Note**: For testing, you can temporarily reduce `CLIENT_TIMEOUT_MS` in `ProcessButton.tsx` to 1 minute.

## Test 6: Cleanup Cron

**Goal**: Verify stale jobs are automatically cleaned up

1. Manually create a stale job in database:
```sql
-- Create stale job (started 35 minutes ago)
INSERT INTO job_runs (job_type, trigger_type, scope, company_id, status, started_at, total_companies)
VALUES ('collect', 'manual', 'single', '<company_id>', 'running', NOW() - INTERVAL '35 minutes', 1)
RETURNING id;

-- Create stale task
INSERT INTO job_run_tasks (job_run_id, company_id, status, started_at)
VALUES ('<job_run_id>', '<company_id>', 'running', NOW() - INTERVAL '35 minutes')
RETURNING id;
```

2. Trigger cleanup cron manually:
```bash
curl -X GET "http://localhost:3000/api/cron/cleanup-jobs" \
  -H "Authorization: Bearer $CRON_SECRET"
```

3. **Expected behavior**:
   - Stale task marked as `failed` with error "Job timed out..."
   - Stale job run marked as `failed` if all tasks failed
   - Response shows number of cleaned tasks

**Verify in database**:
```sql
SELECT status, error_message, completed_at
FROM job_run_tasks
WHERE id = '<stale_task_id>';
```
Should show `status = 'failed'` and `error_message` contains "timed out".

## Test 7: ProcessButton Cancel Functionality

**Goal**: Verify cancel button works correctly

1. Start processing any company
2. Click the "X" cancel button
3. **Expected behavior**:
   - Processing state stops
   - Message shows: "Stopped waiting for job (job may still be running)"
   - Realtime subscription unsubscribes
   - Job continues running on server (check database)

**Verify in database**:
```sql
SELECT status FROM job_run_tasks WHERE id = '<task_id>';
```
Should still show `status = 'running'` (server job not cancelled).

## Summary Checklist

- [ ] API scraper (Lever/Greenhouse) completes successfully
- [ ] Browser scraper (Ashby) triggers GitHub Actions with taskId
- [ ] GitHub Actions updates existing task (not creates new)
- [ ] Deduplication prevents duplicate jobs
- [ ] Errors are properly handled and marked as failed
- [ ] Client-side timeout warning appears after 10 minutes
- [ ] Cancel button stops waiting without cancelling server job
- [ ] Cleanup cron marks stale jobs as failed
- [ ] All jobs eventually complete or fail (no infinite running)

## Troubleshooting

### Jobs stuck in "running"
- Check cleanup cron is running: `*/15 * * * *` schedule
- Manually trigger cleanup: `/api/cron/cleanup-jobs`
- Check GitHub Actions workflow status

### GitHub Actions not updating task
- Verify `TASK_ID` environment variable is set in workflow
- Check workflow logs for "Updating existing task" message
- Verify task exists before workflow runs

### Deduplication not working
- Check API route logs for "already_running" response
- Verify database query finds running tasks correctly
- Check task status is actually "running" (not "pending")
