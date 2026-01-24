# Cron Jobs Final Checklist

## ✅ Completed Steps

- [x] CRON_SECRET is set in Vercel environment variables
- [x] Manual curl test works (endpoint responds correctly)
- [x] Authentication code is updated with better error handling

## Next: Verify Cron Jobs are Registered

### Step 1: Check Cron Jobs in Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: **fintech-insights**
3. Look for **Cron Jobs** tab (may be under Settings → Cron Jobs)
4. You should see 2 cron jobs listed:
   - `/api/cron/collect` - Schedule: `0 6 * * *` (Daily at 6:00 AM UTC)
   - `/api/cron/report` - Schedule: `0 8 * * 1` (Monday at 8:00 AM UTC)

**If you don't see Cron Jobs tab:**
- The `vercel.json` might not be detected
- Ensure `web/vercel.json` is committed to git
- Try redeploying: Go to Deployments → Latest → Redeploy

### Step 2: Test Cron Job via Vercel Dashboard

1. In **Cron Jobs** tab, click on `/api/cron/collect`
2. Click **Run Now** or **Trigger** button
3. Check the execution:
   - Should show "Running" then "Success"
   - Check function logs for any errors
   - Verify response shows `{"success": true, ...}`

### Step 3: Monitor Scheduled Executions

**Current Schedule:**
- **Collect job**: Daily at **6:00 AM UTC** (1:00 AM EST / 2:00 AM EDT)
- **Report job**: Weekly on **Monday at 8:00 AM UTC** (3:00 AM EST / 4:00 AM EDT)

**To verify they're running:**
1. Check Vercel function logs around scheduled times
2. Check database `job_runs` table for new entries (unified job tracking):

```sql
SELECT 
  id,
  job_type,
  status,
  started_at,
  completed_at,
  total_new_jobs,
  total_closed_jobs,
  total_insights,
  error_message
FROM job_runs
ORDER BY started_at DESC
LIMIT 10;
```

### Step 4: Adjust Schedule (Optional)

If you want to change when cron jobs run, edit `web/vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/collect", "schedule": "0 6 * * *" },  // Change this
    { "path": "/api/cron/report", "schedule": "0 8 * * 1" }     // Change this
  ]
}
```

**Cron schedule format:** `minute hour day-of-month month day-of-week`

Examples:
- `0 6 * * *` = Daily at 6:00 AM UTC
- `0 9 * * *` = Daily at 9:00 AM UTC
- `0 8 * * 1` = Monday at 8:00 AM UTC
- `0 10 * * 1-5` = Weekdays at 10:00 AM UTC

After changing, commit and push to trigger a new deployment.

## Troubleshooting

### Cron jobs not showing in dashboard:
- Ensure `web/vercel.json` is committed to git
- Redeploy the project
- Check that you're on a plan that supports cron jobs (Hobby = 2 max)

### Cron jobs not executing:
- Check function logs for 401 errors (authentication issues)
- Verify CRON_SECRET value matches in Vercel
- Check that latest deployment is successful

### Want to test immediately:
- Use "Run Now" button in Vercel Cron Jobs dashboard
- Or wait for next scheduled time

## Success Indicators

✅ Cron jobs appear in Vercel dashboard
✅ Manual trigger via dashboard works
✅ Function logs show successful execution
✅ Database `job_runs` table has entries
✅ Jobs run automatically at scheduled times

## All Set!

If cron jobs are registered in Vercel and manual trigger works, your cron jobs are fully configured! They will now run automatically at the scheduled times.

Monitor the first few scheduled runs to ensure everything works as expected.
