# Questrade Showing Twice on Weekly Insights Page

## TL;DR
Weekly insights page displays duplicate insights for the same company (Questrade shown twice). The page fetches all insights from last 7 days without deduplicating to show only the most recent insight per company.

## Type
**Bug** - UI/Data Display

## Priority
**Medium** - Affects user experience but doesn't break functionality

## Effort
**Low** - Simple deduplication logic needed

## Current State
- Weekly insights page (`/insights`) shows all insights from last 7 days
- Multiple insights for the same company are displayed (e.g., Questrade appears twice with timestamps 8:17 AM and 8:14 AM)
- Header shows "{insights.length} companies analyzed" but actually counts total insights, not unique companies
- No deduplication logic to show only the most recent insight per company

## Expected Outcome
- Each company should appear only once in the "Latest Strategic Insights" section
- Show only the most recent insight per company (by `generated_at`)
- Header count should reflect unique companies, not total insights
- If multiple insights exist for same company, show the latest one

## Root Cause
The query in `web/app/(dashboard)/insights/page.tsx` (lines 27-41) fetches all insights from last 7 days without filtering to the most recent per company:

```typescript
const { data: latestInsightsRaw } = await supabase
  .from("company_insights")
  .select(...)
  .gte("generated_at", sevenDaysAgo)
  .order("generated_at", { ascending: false });
```

The `LatestDigestInsights` component displays all insights passed to it without deduplication.

## Solution
Add deduplication logic to show only the most recent insight per company:

1. **Option A (Recommended):** Deduplicate in the page component after fetching:
   - Group insights by `company_id`
   - Keep only the most recent insight per company (already sorted by `generated_at` desc)
   - Update count to show unique companies

2. **Option B:** Use SQL DISTINCT ON or window function to fetch only latest per company

## Files to Modify
- `web/app/(dashboard)/insights/page.tsx` - Add deduplication logic after fetching insights
- `web/components/insights/LatestDigestInsights.tsx` - Update count display to show unique companies

## Notes
- Dashboard page (`web/app/(dashboard)/page.tsx`) already has similar deduplication logic (lines 90-108) - can reference that pattern
- Multiple insights per company can exist if analysis runs multiple times in the same day
- Archive section should continue showing all historical insights (no deduplication needed there)
