# Strategic Highlights Redesign

**Overall Progress:** `100%`

## TLDR
Redesign the "This week's highlights" panel to show meaningful company-level strategic insights instead of generic "Company X is hiring" cards for every company. The data source should be `company_insights` (strategic analysis) rather than `weekly_digest_companies` (shallow TLDR summaries).

## Critical Decisions
- **Data Source**: Use `company_insights` table instead of `weekly_digest_companies` - it already contains executive summaries, strategic hypotheses, and alignment analysis
- **Insight Granularity**: Insights are generated at company level, analyzing ALL new roles collectively (not per-job insights)
- **Display Limit**: Show only top 4-6 most significant insights, not unlimited cards
- **Significance Ranking**: Add a `significance_score` to company_insights for ranking which insights are most noteworthy
- **Company Count**: Fix to show actual tracked companies (6), not digest entries (was showing 12)

## Current Problems
1. Shows "12 companies" when only 6 are tracked (counting digest entries, not unique companies)
2. Creates a card for every company that posted any job with generic "X is hiring" headline
3. Pulls from `weekly_digest_companies` which has shallow commentary, not strategic analysis
4. The `company_insights` table already has rich strategic analysis but isn't being used for highlights

## Tasks

- [x] 🟩 **Step 1: Add Display Fields to company_insights**
  - [x] 🟩 Create migration to add `headline` (TEXT) - punchy 5-8 word strategic headline
  - [x] 🟩 Add `significance_score` (INTEGER 1-10) - how noteworthy is this insight
  - [x] 🟩 Add `key_signal` (TEXT) - one-liner explaining the strategic signal (e.g., "Pivoting to B2B", "Engineering ramp-up")

- [x] 🟩 **Step 2: Update Company Insight Generation**
  - [x] 🟩 Modify `company-insights.ts` prompt to generate headline, significance_score, and key_signal
  - [x] 🟩 Significance scoring criteria: executive hires (+3), new strategic direction (+3), >50% hiring increase (+2), new tech bet (+2)
  - [x] 🟩 Update database insert to persist new fields

- [x] 🟩 **Step 3: Create New Highlights Component**
  - [x] 🟩 Create `StrategicHighlights.tsx` component to replace `WeeklyDigestsList` usage on dashboard
  - [x] 🟩 Fetch recent `company_insights` (last 14 days) ordered by significance_score
  - [x] 🟩 Limit display to top 4-6 insights
  - [x] 🟩 Card shows: headline, key_signal, company name, confidence badge
  - [x] 🟩 Link to company insights detail page

- [x] 🟩 **Step 4: Update Dashboard Page**
  - [x] 🟩 Change data fetching in `page.tsx` to query `company_insights` instead of `weekly_digest_companies`
  - [x] 🟩 Filter: `generated_at >= 14 days ago`, `significance_score IS NOT NULL`, order by `significance_score DESC`
  - [x] 🟩 Fix "companies" count in header to show actual tracked company count (not insight count)
  - [x] 🟩 Replace `WeeklyDigestsList` with new `StrategicHighlights` component

- [x] 🟩 **Step 5: Create API Endpoint for Highlights**
  - [x] 🟩 Create `/api/insights/highlights` endpoint to fetch top strategic insights
  - [x] 🟩 Include company name, slug via join
  - [x] 🟩 Support `limit` query param (default 6)

- [x] 🟩 **Step 6: Backfill Existing Insights (Optional)**
  - [x] 🟩 Create script to generate headline/significance_score for existing company_insights
  - [x] 🟩 Run one-time backfill or mark old insights as `significance_score = 5` (neutral)

- [x] 🟩 **Step 7: Testing & Verification**
  - [x] 🟩 Run `npm run build` to verify no TypeScript errors
  - [x] 🟩 Verify highlights display correctly with mock data
  - [x] 🟩 Test insight generation produces valid headline and significance_score

## Expected Outcome
The highlights panel will show 4-6 curated strategic insights like:
- "🎯 Koho doubles down on SMB" - "Pivoting from consumer to small business banking"
- "🚀 Neo's engineering surge" - "87 new roles signal major platform rebuild"
- "💰 Wealthsimple bets on AI" - "5 ML engineer hires indicate robo-advisor 2.0"

Instead of generic cards for every company that says "Company is hiring".
