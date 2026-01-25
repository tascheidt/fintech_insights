# Redesign Dashboard for Insights & Interactivity

## TL;DR
Overhaul the main dashboard (`/`) to transform it from a static overview into an insightful, interactive command center. The goal is to surface trends (WoW growth, function breakdowns) and improve navigation without building a full-blown BI tool.

## Objectives
1.  **Surface Trends:** Move beyond point-in-time counts to show velocity and composition changes.
2.  **Improve Navigation:** Make high-level metrics actionable entry points to detailed views.
3.  **Enhance UX:** Create a "beautiful" and modern layout that highlights key signals immediately.

## Key Requirements

### 1. Trend Visualization (New Charts)
*   **Week-over-Week Growth:** Visual indicator or chart showing new job posting volume compared to the previous period.
*   **Function/Department Trends:**
    *   Line/Area chart showing "Types of Functions" over time (weekly/monthly).
    *   Bar/Heatmap comparison of "Companies by Department" to see where hiring focus lies.
*   *Tech Stack:* Use `recharts` (already installed).

### 2. Interactive Stat Cards
*   Update `StatsCards` to be clickable.
*   **Behavior:**
    *   Clicking "Total Active Jobs" -> Navigates to `/jobs?status=active`
    *   Clicking "New Today" -> Navigates to `/jobs?date=today` (or similar filter)
    *   Clicking "Insights" -> Navigates to `/insights`

### 3. Layout & Design
*   Redesign the grid layout to accommodate new visualizations.
*   Keep the design clean and focused; avoid "dashboard clutter."
*   Maintain the "Strategic Highlights" section but potentially integrate it better with the quantitative data.

## Implementation Plan
1.  **Data Fetching:**
    *   Update `web/app/(dashboard)/page.tsx` to fetch historical trend data (group by week/month, function).
    *   Optimize queries to avoid performance hits (consider creating a materialized view or efficient aggregation query if needed, though simple aggregation might suffice for now).
2.  **Component Updates:**
    *   Modify `StatsCards.tsx` to accept `href` props or handle routing.
    *   Create new chart components: `PostingTrendChart`, `FunctionBreakdownChart`.
3.  **Page Layout:**
    *   Recompose `page.tsx` with the new interactive elements.

## Relevant Files
*   `web/app/(dashboard)/page.tsx`
*   `web/components/dashboard/StatsCards.tsx`
*   `web/components/dashboard/CompaniesOverview.tsx`
*   `web/lib/supabase/server.ts` (for data fetching)

## Labels
`enhancement`, `ui/ux`, `frontend`
