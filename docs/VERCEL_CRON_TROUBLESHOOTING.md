# Vercel Cron Jobs Troubleshooting Guide

This guide helps you diagnose and fix issues with Vercel cron jobs not running.

## Quick Checklist

- [ ] `CRON_SECRET` environment variable is set in Vercel project settings
- [ ] `vercel.json` is in the correct location (`/web/vercel.json` for this project)
- [ ] Cron schedules are valid cron expressions
- [ ] Project is on a plan that supports cron jobs (Hobby plan supports 2 cron jobs)
- [ ] Latest deployment is successful

## Common Issues

### 1. CRON_SECRET Not Set

**Symptom**: Cron jobs return 401 Unauthorized or don't execute at all.

**Solution**: 
1. Go to [Vercel Dashboard](https://vercel.com/dashboard) → Your Project → Settings → Environment Variables
2. Add `CRON_SECRET` with a random secure string (e.g., generate with `openssl rand -hex 32`)
3. Make sure it's set for **Production** environment
4. Redeploy your project after adding the variable

**How to verify**:
```bash
# Check if CRON_SECRET is set (from Vercel CLI)
vercel env ls
```

### 2. vercel.json Location

**Symptom**: Cron jobs are not registered in Vercel.

**Solution**: 
- For this project, `vercel.json` should be in `/web/vercel.json`
- Vercel automatically detects it if the project root is set to `/web` in Vercel settings
- Verify in Vercel Dashboard → Settings → General → Root Directory

### 3. Cron Schedule Timezone

**Symptom**: Jobs run at unexpected times.

**Solution**: 
- Vercel cron schedules use **UTC timezone**
- Current schedules:
  - `0 6 * * *` = Daily at 6:00 AM UTC
  - `0 8 * * 1` = Monday at 8:00 AM UTC
- Convert to your local timezone:
  - 6:00 AM UTC = 1:00 AM EST / 2:00 AM EDT
  - 8:00 AM UTC = 3:00 AM EST / 4:00 AM EDT

### 4. Hobby Plan Limitations

**Symptom**: Only some cron jobs are running.

**Solution**: 
- Vercel Hobby plan supports **maximum 2 cron jobs**
- Current configuration has 2 cron jobs (collect and report), which is within limits
- If you need more, upgrade to Pro plan

### 5. Authentication Issues

**Symptom**: 401 Unauthorized errors in logs.

**How to debug**:
1. Check Vercel function logs: Dashboard → Your Project → Functions → Select deployment → Logs
2. Look for authentication error messages
3. Verify `CRON_SECRET` matches between:
   - Vercel environment variables
   - Your code's expectation (`Bearer ${process.env.CRON_SECRET}`)

**Enhanced authentication**:
The code now checks both:
- `Authorization: Bearer <CRON_SECRET>` header (primary)
- `User-Agent: vercel-cron/1.0` header (fallback)

## Testing Cron Jobs Manually

### Test via Vercel Dashboard

1. Go to Vercel Dashboard → Your Project → Cron Jobs
2. Click on a cron job
3. Click "Run Now" to trigger manually

### Test via API

```bash
# Replace with your actual values
CRON_SECRET="your-secret-here"
APP_URL="https://your-app.vercel.app"

# Test collect endpoint
curl -X GET "https://your-app.vercel.app/api/cron/collect" \
  -H "Authorization: Bearer fintech_cron_secret_2026_a8f3b2c1d9e7"

# Test report endpoint
curl -X GET "${APP_URL}/api/cron/report" \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

### Test Locally

```bash
# Set CRON_SECRET in .env.local
echo "CRON_SECRET=test-secret-123" >> web/.env.local

# Start dev server
cd web
npm run dev

# In another terminal, test the endpoint
curl -X GET "http://localhost:3000/api/cron/collect" \
  -H "Authorization: Bearer test-secret-123"
```

## Verifying Cron Job Execution

### Check Vercel Logs

1. Go to Vercel Dashboard → Your Project → Logs
2. Filter by function name: `api/cron/collect` or `api/cron/report`
3. Look for execution logs around scheduled times

### Check Application Logs

The cron jobs now log execution details:
- Start timestamp
- Job type
- Success/error status
- Error messages (if any)

Check your application's logging system (e.g., Supabase logs, external logging service).

### Check Database

Cron jobs create entries in the `cron_logs` table:
```sql
SELECT * FROM cron_logs 
ORDER BY started_at DESC 
LIMIT 10;
```

This shows:
- When jobs ran
- Success/failure status
- Error messages
- Execution statistics

## Debugging Steps

1. **Verify Environment Variables**
   ```bash
   vercel env ls
   ```
   Ensure `CRON_SECRET` is listed and set for Production.

2. **Check vercel.json**
   ```bash
   cat web/vercel.json
   ```
   Verify cron paths and schedules are correct.

3. **Check Recent Deployments**
   - Go to Vercel Dashboard → Deployments
   - Ensure latest deployment is successful
   - Cron configuration is read from the latest successful deployment

4. **Check Function Logs**
   - Vercel Dashboard → Your Project → Functions
   - Look for 401 errors or other authentication failures
   - Check execution times match your schedule

5. **Test Authentication**
   - Use the manual test commands above
   - If manual test works but scheduled doesn't, it's a Vercel cron configuration issue
   - If manual test fails, it's an authentication/authorization issue

## Still Not Working?

1. **Redeploy**: Sometimes Vercel needs a fresh deployment to pick up cron changes
   ```bash
   vercel --prod
   ```

2. **Check Vercel Status**: Visit [status.vercel.com](https://status.vercel.com) to see if there are any service issues

3. **Contact Support**: If all else fails, contact Vercel support with:
   - Project name
   - Cron job paths
   - Error messages from logs
   - Screenshot of environment variables (redact secrets)

## Configuration Reference

Current cron configuration (`web/vercel.json`):
```json
{
  "crons": [
    { "path": "/api/cron/collect", "schedule": "0 6 * * *" },
    { "path": "/api/cron/report", "schedule": "0 8 * * 1" }
  ]
}
```

- **collect**: Runs daily at 6:00 AM UTC
- **report**: Runs weekly on Monday at 8:00 AM UTC

## Related Files

- `/web/app/api/cron/collect/route.ts` - Collection cron job
- `/web/app/api/cron/report/route.ts` - Report cron job
- `/web/lib/cron/auth.ts` - Authentication helper
- `/web/vercel.json` - Vercel configuration
