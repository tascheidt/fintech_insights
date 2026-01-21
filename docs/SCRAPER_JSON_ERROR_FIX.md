# Scraper JSON Extraction Error Fix

## Problem

Cron job logs were showing errors:
```
[error] No JSON found in response for job "Bilingual Sales Representative (Spanish) - Dufferin Mall"
[error] No JSON found in response for job "Sales Representative - Mic Mac Mall "
[error] No JSON found in response for job "Sales Representative - Outlet Collection Winnipeg"
```

## Root Cause

The `extractJobStructure` function in `web/lib/analysis/structure.ts` was encountering cases where:
1. Gemini API sometimes returns empty responses despite requesting JSON mode
2. Gemini API sometimes returns malformed JSON that couldn't be parsed
3. No retry logic existed for transient failures
4. Insufficient logging made it difficult to diagnose issues

## Solution

### 1. Enhanced Error Handling

- **Empty Response Detection**: Now checks for empty responses and logs appropriately
- **Better JSON Extraction**: Improved fallback logic to extract JSON from various formats
- **Detailed Logging**: Added response previews and full error messages for debugging

### 2. Retry Logic

Added automatic retry mechanism:
- **Up to 3 attempts** (initial + 2 retries) for failed extractions
- **Exponential backoff**: Waits 1s, 2s, 4s between retries
- **Retries on**:
  - Empty responses
  - Malformed JSON that can't be extracted
  - API errors (rate limits, network issues, timeouts)

### 3. Improved Logging

- **Response Previews**: Logs first 200 chars of problematic responses
- **Full Response Logging**: Logs full response if under 500 chars
- **Success Logging**: Logs when JSON is successfully extracted from fallback methods
- **Error Details**: Includes error messages and problematic JSON snippets

## Changes Made

**File**: `web/lib/analysis/structure.ts`

1. Added `retryCount` parameter to `extractJobStructure()` function
2. Enhanced empty response handling with retry logic
3. Improved JSON parsing error messages with response previews
4. Added retry logic for empty/malformed responses
5. Added retry logic for API errors (rate limits, network issues)

## Expected Behavior

### Before Fix
- Errors logged but no retry attempted
- Difficult to diagnose what Gemini actually returned
- Jobs with extraction failures were skipped entirely

### After Fix
- Automatic retry up to 3 times for transient failures
- Detailed logging shows what Gemini returned
- Better success rate for job structure extraction
- Clearer error messages for persistent failures

## Monitoring

Watch for these log patterns:

**Success (with retry)**:
```
[log] Retrying extraction for job "..." (attempt 2/3)
[log] Successfully parsed JSON after fixing trailing commas for job "..."
```

**Success (from markdown)**:
```
[log] Successfully extracted JSON from markdown code block for job "..."
```

**Failure (after retries)**:
```
[error] No JSON found in response for job "...". Response length: X, Preview: ...
[error] Full response: ...
```

**API Error (with retry)**:
```
[log] Retrying extraction for job "..." due to rate limit (attempt 2/3)
```

## Testing

The next cron job run will automatically use the improved error handling. Monitor logs to see:
1. If retries are happening (should reduce errors)
2. What Gemini is actually returning when errors occur
3. Success rate improvement

## Related Issues

This fix addresses:
- Transient Gemini API failures
- Empty responses from Gemini
- Malformed JSON responses
- Rate limiting issues
- Network timeouts

## Next Steps

1. **Monitor**: Watch logs during next cron job execution
2. **Analyze**: Review error logs to see if patterns emerge
3. **Tune**: Adjust retry count or backoff timing if needed
4. **Report**: If errors persist, the enhanced logging will help diagnose root cause
