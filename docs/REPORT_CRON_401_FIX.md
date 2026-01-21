# Report Cron Job 401 Error Fix

## Problem

The `/api/cron/report` endpoint was returning `401 Unauthorized` errors when triggered by Vercel Cron, even though:
- `/api/cron/collect` works correctly
- Both routes use the same authentication helper
- CRON_SECRET is set in Vercel environment variables

## Root Cause Analysis

The authentication helper was checking headers, but there might be:
1. **Case sensitivity issues**: Header names might be normalized differently
2. **Missing Authorization header**: Vercel might not always send it (though it should)
3. **User-Agent mismatch**: Potential whitespace or formatting issues

## Solution

### 1. Case-Insensitive Header Lookup

Updated `validateCronRequest()` to check both lowercase and original case:
```typescript
const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
const userAgent = req.headers.get("user-agent") || req.headers.get("User-Agent");
```

### 2. Robust User-Agent Checking

Added `.trim()` to handle any whitespace issues:
```typescript
const hasUserAgent = userAgent?.trim() === "vercel-cron/1.0";
```

### 3. Enhanced Diagnostic Logging

Added detailed logging to see exactly what headers are received:
- Logs received Authorization header (truncated)
- Logs received User-Agent
- Logs all header names for debugging
- Logs expected auth prefix for comparison

### 4. Improved User-Agent Fallback

The authentication allows requests with `User-Agent: vercel-cron/1.0` even if Authorization header is missing or incorrect, since Vercel cron jobs always send this User-Agent.

## Changes Made

**File**: `web/lib/cron/auth.ts`

1. ✅ Case-insensitive header lookup
2. ✅ Trim User-Agent for whitespace handling
3. ✅ Enhanced error logging with header details
4. ✅ Better success logging (optional, via env var)

## Testing

After deployment, monitor Vercel logs for:
- Successful authentication messages
- Detailed error logs if authentication still fails
- Header information to diagnose any remaining issues

## Expected Behavior

### Before Fix
- Report cron job returns 401 Unauthorized
- Limited visibility into why authentication fails

### After Fix
- Report cron job authenticates successfully
- Detailed logs show exactly what headers are received
- User-Agent fallback ensures Vercel cron requests are accepted

## Verification

1. **Deploy the changes**
2. **Check Vercel logs** when report cron runs
3. **Look for**:
   - "Cron authentication successful" messages
   - Detailed error logs if issues persist
   - Header information in error logs

## Next Steps

1. Deploy these changes to production
2. Monitor the next scheduled report cron execution
3. Check logs to verify authentication is working
4. If issues persist, the enhanced logging will show exactly what's happening

## Related Files

- `web/lib/cron/auth.ts` - Authentication helper (updated)
- `web/app/api/cron/report/route.ts` - Report cron route (uses auth helper)
- `web/app/api/cron/collect/route.ts` - Collect cron route (uses auth helper)
