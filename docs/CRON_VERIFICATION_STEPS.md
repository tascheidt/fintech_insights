# Cron Jobs Verification Steps

## ✅ Step 1: Manual Test - COMPLETE

Your manual curl test succeeded! This confirms:
- ✅ Endpoint is accessible
- ✅ Authentication is working
- ✅ CRON_SECRET value is correct

## Step 2: Verify CRON_SECRET in Vercel

**Critical**: Even though manual test works, you need to ensure `CRON_SECRET` is set in Vercel environment variables so Vercel can automatically add the Authorization header when triggering cron jobs.

### Check in Vercel Dashboard:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select project: **fintech-insights**
3. Go to **Settings** → **Environment Variables**
4. Look for `CRON_SECRET`:
   - **If it exists**: Verify the value matches `fintech_cron_secret_2026_a8f3b2c1d9e7`
   - **If it doesn't exist**: Add it now (see below)
   - **If value is different**: Update it to match

### Add/Update CRON_SECRET:

1. In Environment Variables page, click **Add New** (or edit existing)
2. Set:
   - **Key**: `CRON_SECRET`
   - **Value**: `fintech_cron_secret_2026_a8f3b2c1d9e7`
   - **Environment**: Select **Production** (and Preview/Development if you want)
3. Click **Save**
4. **Important**: Redeploy after adding/updating:
   - Go to **Deployments** tab
   - Click **⋯** (three dots) on latest deployment
   - Click **Redeploy**

## Step 3: Verify Cron Jobs are Registered

1. In Vercel Dashboard → Your Project
2. Go to **Cron Jobs** tab (or **Settings** → **Cron Jobs**)
3. You should see 2 cron jobs:
   - `/api/cron/collect` - Schedule: `0 6 * * *` (Daily at 6:00 AM UTC)
   - `/api/cron/report` - Schedule: `0 8 * * 1` (Monday at 8:00 AM UTC)

**If you don't see a Cron Jobs tab:**
- The `vercel.json` file might not be detected
- Check that `web/vercel.json` exists and is committed to git
- Redeploy the project

## Step 4: Test Cron Job Execution via Vercel

### Option A: Wait for Scheduled Time

- **Collect job**: Runs daily at 6:00 AM UTC (1:00 AM EST / 2:00 AM EDT)
- **Report job**: Runs Monday at 8:00 AM UTC (3:00 AM EST / 4:00 AM EDT Monday)

### Option B: Trigger Manually via Vercel Dashboard

1. Go to **Cron Jobs** tab
2. Click on a cron job (e.g., `/api/cron/collect`)
3. Click **Run Now** or **Trigger** button
4. Check the execution logs

### Option C: Check Function Logs

1. Go to **Deployments** tab
2. Click on your latest deployment
3. Go to **Functions** tab
4. Look for `api/cron/collect` or `api/cron/report`
5. Check execution logs for any errors

## Step 5: Monitor Execution

### Check Database for Job Runs

```sql
-- Run in Supabase SQL Editor
-- Uses unified job_runs table for all job tracking
SELECT 
  id,
  job_type,
  status,
  started_at,
  completed_at,
  error_message,
  total_new_jobs,
  total_closed_jobs,
  total_insights
FROM job_runs
ORDER BY started_at DESC
LIMIT 10;
```

### Check Vercel Function Logs

1. Vercel Dashboard → Your Project → **Logs**
2. Filter by function: `api/cron/collect` or `api/cron/report`
3. Look for execution logs around scheduled times

## Expected Behavior

Once everything is configured correctly:

1. **Vercel automatically triggers** cron jobs at scheduled times
2. **Vercel adds** `Authorization: Bearer <CRON_SECRET>` header automatically
3. **Your endpoint validates** the authentication
4. **Job executes** and creates entries in `job_runs` table
5. **Logs appear** in Vercel function logs

## Troubleshooting

### Cron jobs not running at scheduled time:

1. **Check timezone**: Vercel uses UTC. Your 6am schedule is 6:00 AM UTC
2. **Check plan**: Hobby plan supports max 2 cron jobs (you have 2, so OK)
3. **Check deployment**: Latest deployment must be successful
4. **Check logs**: Look for 401 errors (authentication failures)

### Getting 401 errors in logs:

- CRON_SECRET not set in Vercel environment variables
- CRON_SECRET value mismatch between Vercel and your code
- Solution: Set/update CRON_SECRET in Vercel and redeploy

### Cron jobs not showing in dashboard:

- `vercel.json` not in correct location (`web/vercel.json`)
- File not committed to git
- Solution: Ensure file exists and redeploy

## Next Steps

1. ✅ **Verify CRON_SECRET in Vercel** (most important!)
2. ✅ **Check Cron Jobs tab** exists and shows 2 jobs
3. ✅ **Redeploy** if you updated CRON_SECRET
4. ✅ **Wait for next scheduled run** or trigger manually
5. ✅ **Monitor logs** to confirm execution

## Quick Test After Setup

After verifying CRON_SECRET is set in Vercel:

1. Go to **Cron Jobs** tab
2. Click **Run Now** on `/api/cron/collect`
3. Check function logs for successful execution
4. Check database `job_runs` table for new entry

If this works, your cron jobs are fully configured! 🎉
