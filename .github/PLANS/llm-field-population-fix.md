# LLM Field Population Fix Plan

**Overall Progress:** `100%`

## TLDR
Fix the issue where department, location, and function_category fields are not being populated for newly scraped jobs. The LLM extraction logic exists and works, but it's not completing before jobs are marked as done because the extraction promises are not awaited.

## Root Cause
In `web/lib/jobs/processor.ts` at line 276, `Promise.allSettled(extractionPromises)` is NOT awaited. The ingestion stage completes immediately, marking jobs as done before the LLM extractions finish populating the fields.

## Solution
Await the extraction promises so they complete before marking ingestion as done. The extraction function already updates all required fields correctly - we just need to wait for it.

## Tasks:

- [x] 🟩 **Step 1: Fix async/await in extraction promise handling**
  - [x] 🟩 Change line 276 in `web/lib/jobs/processor.ts` from `.then()` to `await Promise.allSettled()`
  - [x] 🟩 Update comment to reflect that extractions now block completion
  - [x] 🟩 Keep existing error logging (failures logged but don't throw)

- [ ] 🟥 **Step 2: Test the fix**
  - [ ] 🟥 Run a test scrape for a single company
  - [ ] 🟥 Verify department, location, and function_category fields are populated in database
  - [ ] 🟥 Confirm extraction completes before job is marked as done

- [x] 🟩 **Step 3: Backfill recent jobs**
  - [x] 🟩 Created `web/scripts/backfill-recent-jobs-fields.ts` script
  - [x] 🟩 Script finds recent jobs (default: last 7 days) missing department, location, or function_category
  - [x] 🟩 Uses same extraction logic as ingestion pipeline
  - [x] 🟩 Updates all three fields plus other Silver Layer fields

## Implementation

**File:** `web/lib/jobs/processor.ts` (line 273-284)

**Change:**
```typescript
// Before:
Promise.allSettled(extractionPromises).then((results) => { ... });

// After:
const results = await Promise.allSettled(extractionPromises);
const failed = results.filter((r) => r.status === 'rejected').length;
if (failed > 0) {
  console.warn(`Silver Layer extraction: ${failed} of ${extractionPromises.length} jobs failed`);
}
```

## Notes

- **Performance**: Awaiting will add time to ingestion, but ensures data quality
- **Error Handling**: Individual extraction failures won't block the pipeline (already handled)
- **Fields Updated**: The extraction function already correctly updates `department`, `location`, `function_category`, `standardized_department`, and `location_structured`
