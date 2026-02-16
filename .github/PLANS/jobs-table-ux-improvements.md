# Jobs Table UX Improvements

Plan for improving the All Jobs page and JobHistoryView component usability.

---

## 1. Sortable Column Headers (Primary)

Add clickable column headers to the jobs table with visual sort indicators.

### Current Architecture

Data flows in [web/components/companies/JobHistoryView.tsx](web/components/companies/JobHistoryView.tsx):

```
jobs (props) → filteredJobs (filters) → paginatedJobs (pagination) → JobsTableView
```

### Implementation

- Add `sortKey` and `sortDirection` ("asc" | "desc") state; default: `firstSeenDate` desc
- Insert sort step: `filteredJobs` → `sortedJobs` → `paginatedJobs`
- Reset `currentPage` to 1 when sort changes
- Pass `sortKey`, `sortDirection`, `onSortClick(key)` to `JobsTableView`
- Map columns to JobData fields with appropriate comparators (string: localeCompare, date: timestamp, boolean: false-first)
- Make TableHead elements clickable with `ArrowUp`/`ArrowDown`/`ArrowUpDown` icons and `aria-sort`
- Null values sort to end in both directions

---

## 2. Additional Usability Improvements

### High impact, low effort

**2.1 Clear-search button in search input**

- Show an X (or similar) button inside the search field when it has content
- Clicking clears the search immediately
- Matches common UX pattern; avoids extra "Clear filters" click when only search is active

**2.2 Filter pills / active filter chips**

- Display applied filters as dismissible chips below the filter row (e.g., "Active", "Last 30 Days", "Wealthsimple")
- Each chip has its own X to remove that filter
- Improves at-a-glance visibility of what is applied and makes it easier to remove individual filters

**2.3 Whole row clickable**

- Make the entire table row navigate to the job detail (not only the title link)
- Keeps title and company as links for middle-click/open-in-tab; row click uses primary navigation
- Improves target size and reduces misclicks, especially on mobile

**2.4 Items-per-page selector**

- Add a dropdown (e.g., 12, 24, 48, 100) so users can control how many jobs appear per page
- With ~479 jobs, 24/page = 20 pages; 48 or 100 reduces pagination friction
- Optionally persist preference in localStorage (similar to view toggle)

### Medium impact, medium effort

**2.5 Sticky table header**

- Use `position: sticky; top: 0` on the table header row when in table view
- Keeps column labels visible when scrolling long lists
- Improves orientation in large datasets

**2.6 Export filtered results (CSV)**

- Add "Export" button that downloads current filtered/sorted results as CSV
- Supports competitive intel workflows (analysis in Excel/Sheets, sharing with team)
- Client-side generation from `filteredJobs`/`sortedJobs`; no API change

**2.7 Persist sort preference**

- Save `sortKey` and `sortDirection` in localStorage (key: `jobs-sort-${companySlug}`)
- Restore on mount so users return to their preferred view
- Mirrors existing `useViewPreference` pattern for view toggle

### Nice to have

**2.8 URL state for filters and sort**

- Sync search, status, time, company, sort, and page to URL query params
- Enables shareable/bookmarkable filtered views and back-button behavior
- Requires `useSearchParams` and `useRouter`; consider for a later iteration

**2.9 Jump-to-page input**

- For many pages (e.g., 20), add an input to jump directly to a page number
- Reduces repetitive "Next" clicks for users who know which page they want

**2.10 Data freshness indicator**

- Show "Data as of [date]" or "Last updated [time]" near the job count
- Builds trust and clarifies how current the data is

---

## Implementation Priority

| Phase | Scope | Effort |
|-------|-------|--------|
| 1 | Sortable columns | 1–2 hrs |
| 2 | Clear-search button, filter pills, whole-row click, items-per-page | 2–3 hrs |
| 3 | Sticky header, export CSV, persist sort | 1–2 hrs |
| 4 | URL state, jump-to-page, freshness indicator | 2–3 hrs |

---

## File to Modify

All changes are localized to:

- [web/components/companies/JobHistoryView.tsx](web/components/companies/JobHistoryView.tsx)

No changes to the jobs page route or API are required.
