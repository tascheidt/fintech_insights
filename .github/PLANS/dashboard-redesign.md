# Dashboard Redesign Implementation Plan

**Overall Progress:** `0%`

## TLDR
Transform the main dashboard from a static overview into an interactive command center. We will add trend visualizations (WoW growth, function breakdowns), make stat cards interactive entry points, and modernize the layout to surface insights immediately.

## Critical Decisions
- **Visualization Library:** Using `recharts` (already installed) for lightweight, responsive charts.
- **Data Strategy:** Fetching raw dataset (id, date, category) for the last 90 days and aggregating in the Server Component (`page.tsx`). This avoids complex SQL migrations for now while remaining performant for moderate dataset sizes.
- **Navigation:** Stat cards will become direct links to pre-filtered views (e.g., "Active Jobs" -> `/jobs?status=active`), reducing clicks to actionable data.

## Tasks

- [x] 🟩 **Step 1: Data Access & Types**
  - [x] 🟩 Define types for aggregated data: `WeeklyTrend` (week, count), `FunctionTrend` (period, category, count).
  - [x] 🟩 Create `web/lib/dashboard-queries.ts` to house the aggregation logic.
    - [x] 🟩 Implement `getPostingTrends(days: number)`: Fetches `first_seen_date` for last X days and groups by week.
    - [x] 🟩 Implement `getFunctionTrends(days: number)`: Fetches `function_category` & `first_seen_date`, groups by month/week and high-level Category Group (Engineering, Product, etc.).
  - [x] 🟩 Update `StatsCards.tsx` to accept optional `href` prop and render as `Link` when present.

- [x] 🟩 **Step 2: Trend Visualization Components**
  - [x] 🟩 Create `web/components/dashboard/charts/PostingTrendChart.tsx`:
    - [x] 🟩 Use `recharts` AreaChart.
    - [x] 🟩 Show "New Jobs per Week" with a gradient fill.
    - [x] 🟩 Tooltip to show exact counts.
  - [x] 🟩 Create `web/components/dashboard/charts/FunctionBreakdownChart.tsx`:
    - [x] 🟩 Use `recharts` BarChart (stacked or grouped).
    - [x] 🟩 Show distribution of top 5 function groups over the last 3 months.
  - [x] 🟩 Ensure charts are responsive (use `ResponsiveContainer`).

- [x] 🟩 **Step 3: Page Composition**
  - [x] 🟩 Update `web/app/(dashboard)/page.tsx`:
    - [x] 🟩 Call new query functions in `Promise.all`.
    - [x] 🟩 Replace static layout with new grid:
      - [x] 🟩 **Row 1:** Interactive Stats Cards (Full width).
      - [x] 🟩 **Row 2:** Main Trends (2/3 width: Posting Trend, 1/3 width: Function Breakdown or vice-versa).
      - [x] 🟩 **Row 3:** Strategic Highlights & Companies List.
  - [x] 🟩 Pass `href` props to `StatsCards`:
    - [x] 🟩 "Active Jobs" -> `/jobs?status=active`
    - [x] 🟩 "New Today" -> `/jobs?date=today` (ensure this filter works or maps to a date range)
    - [x] 🟩 "Insights" -> `/insights`

- [x] 🟩 **Step 4: Critical UX Review & Iteration**
  - [x] 🟩 Launch a UX Review Agent to critique the new dashboard layout, focusing on:
    - [x] 🟩 Information hierarchy and "insightfulness".
    - [x] 🟩 Visual balance and spacing.
    - [x] 🟩 Interactivity and intuitive navigation.
  - [x] 🟩 Implement feedback from the review agent.
  - [x] 🟩 Repeat review/revision cycle until the agent is satisfied with the outcome.

- [x] 🟩 **Step 5: Polish & Verify**
  - [x] 🟩 Add loading skeletons (`DashboardSkeleton`) for better perceived performance.
  - [x] 🟩 Verify mobile responsiveness (stack charts on small screens).
  - [x] 🟩 Check that clicking Stat Cards correctly filters the target pages.
