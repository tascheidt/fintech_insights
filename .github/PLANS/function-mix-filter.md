# Add Company Filter to Function Mix Chart

**Overall Progress:** `0%`

## TLDR
Add a company selector to the "Function Mix" chart on the dashboard to allow users to analyze hiring distribution per company. This will be implemented using client-side filtering of a raw dataset to ensure instant interactivity without page reloads.

## Critical Decisions
- **Data Strategy:** Fetch raw job data (company_id, function_category, date) for the last 90 days instead of pre-aggregated trends. This allows the client to re-aggregate on the fly based on the selected filter.
- **Component Architecture:** Create a new `FunctionBreakdownContainer` client component that handles the state (selected company) and aggregation logic, wrapping the existing `FunctionBreakdownChart`.

## Tasks

- [ ] 🟥 **Step 1: Data Access Update**
  - [ ] 🟥 Create `getRawFunctionData(days: number)` in `web/lib/dashboard-queries.ts` to return `RawFunctionData[]` (`company_id`, `function_category`, `first_seen_date`).
  - [ ] 🟥 Update `web/app/(dashboard)/page.tsx` to call `getRawFunctionData` instead of `getFunctionTrends`.

- [ ] 🟥 **Step 2: Client Component Implementation**
  - [ ] 🟥 Create `web/components/dashboard/charts/FunctionBreakdownContainer.tsx`:
    - [ ] 🟥 Accept `rawData` and `companies` (id, name) as props.
    - [ ] 🟥 Implement state for `selectedCompanyId` (default "all").
    - [ ] 🟥 Implement `useMemo` logic to filter `rawData` by company and then aggregate into `FunctionTrend[]` format (reusing logic from `getFunctionTrends`).
    - [ ] 🟥 Render a `Select` (shadcn/ui) for company selection.
    - [ ] 🟥 Render `FunctionBreakdownChart` with the computed data.

- [ ] 🟥 **Step 3: Integration**
  - [ ] 🟥 Replace `FunctionBreakdownChart` in `page.tsx` with `FunctionBreakdownContainer`.
  - [ ] 🟥 Pass the raw data and the companies list (already fetched) to the container.

- [ ] 🟥 **Step 4: Verification**
  - [ ] 🟥 Verify "All Companies" view matches previous output.
  - [ ] 🟥 Verify filtering by specific company updates the chart correctly.
