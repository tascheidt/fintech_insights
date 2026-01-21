# Company Insights JSON Parsing Error Fix

## Problem

The report cron job was failing with JSON parsing errors:
```
Error detecting company type: SyntaxError: Unexpected token 'H', "Here is th"... is not valid JSON
```

This occurred when Gemini returned text responses instead of valid JSON, despite requesting JSON mode.

## Root Cause

Multiple functions in the company insights flow were doing simple `JSON.parse()` without error handling:
1. `detectCompanyType()` - Company type detection
2. `extractFinancialContext()` - Financial data extraction  
3. `generateInsightWithLLM()` - Main insight generation

When Gemini occasionally returns non-JSON responses (like "Here is the..." prefixed text), these functions would crash.

## Solution

Applied the same robust JSON extraction pattern used in `structure.ts`:

### 1. Enhanced JSON Parsing

- **Empty Response Detection**: Checks for empty responses
- **Markdown Code Block Extraction**: Extracts JSON from markdown code blocks
- **Trailing Comma Fixes**: Fixes common JSON formatting issues
- **Better Error Messages**: Logs response previews and full responses for debugging

### 2. Retry Logic (for `detectCompanyType`)

- **Up to 3 attempts** for failed extractions
- **Exponential backoff**: 1s, 2s delays between retries
- **Retries on**: Empty responses, malformed JSON, API errors

### 3. Improved Logging

- Response previews (first 200 chars) when errors occur
- Full response logging for short responses (<500-1000 chars)
- Success messages when JSON is extracted via fallback methods

## Changes Made

**File**: `web/lib/analysis/company-research.ts`
- ✅ Fixed `detectCompanyType()` with retry logic and robust JSON extraction
- ✅ Fixed `extractFinancialContext()` with better error handling

**File**: `web/lib/analysis/company-insights.ts`
- ✅ Fixed `generateInsightWithLLM()` with robust JSON extraction

## Expected Behavior

### Before Fix
- Report cron job crashes on JSON parsing errors
- Company insights generation fails silently
- No visibility into what Gemini actually returned

### After Fix
- Automatic JSON extraction from various formats
- Retry logic handles transient failures
- Detailed logging shows what Gemini returned
- Better error messages for debugging

## Testing

The next report cron job execution will automatically use the improved error handling. Monitor logs to see:
1. If JSON extraction succeeds via fallback methods
2. What Gemini is actually returning when errors occur
3. Success rate improvement for company insights generation

## Related Issues

This fix addresses:
- JSON parsing errors in company type detection
- JSON parsing errors in financial context extraction
- JSON parsing errors in insight generation
- Empty responses from Gemini
- Malformed JSON responses

## Next Steps

1. **Deploy**: Push changes to trigger Vercel deployment
2. **Monitor**: Watch logs during next report cron execution
3. **Analyze**: Review error logs to see if patterns emerge
4. **Tune**: Adjust retry count or backoff timing if needed
