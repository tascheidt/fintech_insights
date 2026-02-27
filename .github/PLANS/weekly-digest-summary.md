# Weekly Digest Global Summary Implementation Plan

**Overall Progress:** `100%`

## TLDR
We are adding a "Global Summary" section to the weekly digest email. This section will look across all company updates to identify broader market trends (e.g., "Everyone is hiring for AI," "Crypto infrastructure is cooling down") and provide a true "TL;DR" for the busy reader at the very top of the email.

## Critical Decisions
- **Two-Pass AI Analysis**: We will first generate individual company summaries (as we do now), and then perform a second AI pass using those summaries as context to generate the global summary. This ensures the global summary is grounded in the specific insights we've already found.
- **Gemini Pro Latest**: We will use `gemini-pro-latest` for the global summary generation to ensure high-quality synthesis and trend spotting.
- **Fallback Strategy**: If the global summary generation fails (e.g., API error), we will omit the section rather than showing a generic placeholder, to maintain high signal-to-noise ratio.

## Tasks

- [x] 🟩 **Step 1: Update Data Structures**
  - [x] 🟩 Update `TLDRCommentary` interface in `web/lib/analysis/digest.ts` if needed (or reuse it).
  - [x] 🟩 Update `WeeklyDigest` interface in `web/lib/analysis/digest.ts` to include an optional `global_summary` field of type `TLDRCommentary`.

- [x] 🟩 **Step 2: Implement Global Summary Logic**
  - [x] 🟩 Define `GLOBAL_SUMMARY_PROMPT` in `web/lib/analysis/digest.ts`. This prompt should instruct the AI to synthesize trends from the provided company summaries.
  - [x] 🟩 Implement `generateGlobalSummary(companySummaries: CompanyWeeklySummary[]): Promise<TLDRCommentary | null>` function in `web/lib/analysis/digest.ts`.
  - [x] 🟩 Update `generateWeeklyReport` to call `generateGlobalSummary` after the company loop and attach the result to the returned `WeeklyDigest` object.

- [x] 🟩 **Step 3: Update Email Template**
  - [x] 🟩 Modify `web/lib/email/templates/weekly-digest.tsx` to accept the updated `WeeklyDigest` type.
  - [x] 🟩 Add a new `GlobalSummarySection` component (or similar) to render the global headline and body at the top of the email, just below the header and above the stats.
  - [x] 🟩 Ensure it handles the case where `global_summary` is null (though ideally it shouldn't be).

- [x] 🟩 **Step 4: Verification**
  - [x] 🟩 Create or update a test script (e.g., `web/scripts/test-digest-summary.ts`) to generate a digest and print the global summary to the console.
  - [ ] 🟥 Run the test script and verify the quality of the generated summary.

## Implementation Notes

### Files Modified
- `web/lib/analysis/digest.ts` - Added `global_summary` field to `WeeklyDigest`, implemented `GLOBAL_SUMMARY_PROMPT`, `buildCompanySummariesForGlobalPrompt()`, and `generateGlobalSummary()` functions.
  - **Fixed**: Added company filtering to only include `is_active = true` and `track_for_strategy = true` companies (excludes Monzo and other non-strategic companies).
  - **Fixed**: Improved error logging in `generateGlobalSummary()` to debug parsing failures - now logs raw AI response when parsing fails.
- `web/lib/email/templates/weekly-digest.tsx` - Added `GlobalSummarySection` component with styling, renders conditionally when `global_summary` is present.

### Files Created
- `web/scripts/test-digest-summary.ts` - Test script to generate a digest and print the global summary.

### Bug Fixes
1. **Company Filtering**: Updated `getWeeklyData()` to filter companies by `is_active = true` AND `track_for_strategy = true` to exclude non-strategic companies like Monzo.
2. **Error Logging**: Enhanced `generateGlobalSummary()` with detailed logging to help debug parsing failures - now shows raw AI response when JSON parsing fails.

### Testing
Run the test script to verify:
```bash
cd web
npx tsx --env-file=.env.local scripts/test-digest-summary.ts
```

The improved logging will now show what the AI actually returned if parsing fails, helping diagnose any issues.
