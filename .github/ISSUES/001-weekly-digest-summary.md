# Add Cross-Company Summary to Weekly Digest

**ID:** 001
**Type:** Feature
**Priority:** Normal
**Effort:** Medium

## TL;DR
The weekly digest currently provides per-company insights but lacks a high-level overview. We need to add a summary that looks across all companies to identify broader trends and provide a "TL;DR" for the entire week.

## Current State
- `generateWeeklyReport` in `web/lib/analysis/digest.ts` iterates through companies and generates individual summaries.
- `WeeklyDigest` interface only contains metadata (dates, counts) and a list of company summaries.
- The email template `web/lib/email/templates/weekly-digest.tsx` lists company sections sequentially without a unifying introduction.

## Expected Outcome
1.  **Data Structure Update**: Update `WeeklyDigest` interface to include a `global_summary` field containing a `headline` and `body`.
2.  **Logic Update**: Modify `generateWeeklyReport` to perform a final AI pass. After generating individual company summaries, aggregate them and prompt the AI to identify cross-company trends (e.g., "Everyone is hiring for AI," "Crypto infrastructure is cooling down").
3.  **UI Update**: Update the `WeeklyDigestEmail` component to display this global summary at the top, providing a true "TL;DR" for the busy reader.

## Relevant Files
- `web/lib/analysis/digest.ts`: Core logic for report generation.
- `web/lib/email/templates/weekly-digest.tsx`: Email template to render the new summary.

## Implementation Plan
1.  Extend `WeeklyDigest` interface.
2.  Create a new prompt for the global summary in `digest.ts`.
3.  Implement `generateGlobalSummary` function.
4.  Call this function in `generateWeeklyReport` after collecting company data.
5.  Update the email template to render the new section.

## Risks / Notes
- **Context Window**: Ensure the prompt context (all company summaries) fits within the model's limits. `gemini-3.1-pro-preview` should handle this easily, but we should be mindful of token usage.
- **Fallback**: Implement a default generic summary if the AI generation fails.
