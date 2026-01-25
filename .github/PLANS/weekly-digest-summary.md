# Weekly Digest Global Summary Implementation Plan

**Overall Progress:** `0%`

## TLDR
We are adding a "Global Summary" section to the weekly digest email. This section will look across all company updates to identify broader market trends (e.g., "Everyone is hiring for AI," "Crypto infrastructure is cooling down") and provide a true "TL;DR" for the busy reader at the very top of the email.

## Critical Decisions
- **Two-Pass AI Analysis**: We will first generate individual company summaries (as we do now), and then perform a second AI pass using those summaries as context to generate the global summary. This ensures the global summary is grounded in the specific insights we've already found.
- **Gemini 3 Pro**: We will use `gemini-3-pro-preview` for the global summary generation to ensure high-quality synthesis and trend spotting.
- **Fallback Strategy**: If the global summary generation fails (e.g., API error), we will omit the section rather than showing a generic placeholder, to maintain high signal-to-noise ratio.

## Tasks

- [ ] 🟥 **Step 1: Update Data Structures**
  - [ ] 🟥 Update `TLDRCommentary` interface in `web/lib/analysis/digest.ts` if needed (or reuse it).
  - [ ] 🟥 Update `WeeklyDigest` interface in `web/lib/analysis/digest.ts` to include an optional `global_summary` field of type `TLDRCommentary`.

- [ ] 🟥 **Step 2: Implement Global Summary Logic**
  - [ ] 🟥 Define `GLOBAL_SUMMARY_PROMPT` in `web/lib/analysis/digest.ts`. This prompt should instruct the AI to synthesize trends from the provided company summaries.
  - [ ] 🟥 Implement `generateGlobalSummary(companySummaries: CompanyWeeklySummary[]): Promise<TLDRCommentary | null>` function in `web/lib/analysis/digest.ts`.
  - [ ] 🟥 Update `generateWeeklyReport` to call `generateGlobalSummary` after the company loop and attach the result to the returned `WeeklyDigest` object.

- [ ] 🟥 **Step 3: Update Email Template**
  - [ ] 🟥 Modify `web/lib/email/templates/weekly-digest.tsx` to accept the updated `WeeklyDigest` type.
  - [ ] 🟥 Add a new `GlobalSummarySection` component (or similar) to render the global headline and body at the top of the email, just below the header and above the stats.
  - [ ] 🟥 Ensure it handles the case where `global_summary` is null (though ideally it shouldn't be).

- [ ] 🟥 **Step 4: Verification**
  - [ ] 🟥 Create or update a test script (e.g., `web/scripts/test-digest-summary.ts`) to generate a digest and print the global summary to the console.
  - [ ] 🟥 Run the test script and verify the quality of the generated summary.
