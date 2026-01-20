# Dashboard: Change RecentInsights to Latest Postings with Company Filter

**Type:** Feature  
**Priority:** Normal  
**Effort:** Medium  
**Status:** Open

## TL;DR

Replace the "Recent Insights" box on the main dashboard with a "Latest Postings" component that displays recent job postings, with a dropdown filter to sort/filter by company.

## Current State

The dashboard shows a `RecentInsights` component that displays:
- Recent strategic insights (from `strategic_insights` table)
- Links to individual insights
- Shows company name and job title for each insight
- No filtering/sorting capabilities

**Files:**
- `web/components/dashboard/RecentInsights.tsx` - Component displaying insights
- `web/app/(dashboard)/page.tsx` - Dashboard page that queries and renders RecentInsights

**Current Query:** Fetches from `strategic_insights` table with job posting relationships, ordered by `run_date` descending, limited to 5.

## Expected Outcome

A new "Latest Postings" component that:
1. **Displays job postings** instead of insights
   - Shows: title, company name, department, location, first_seen_date
   - Links to individual job posting pages (`/jobs/[id]`)
   - Ordered by `first_seen_date` descending (newest first)

2. **Company filter dropdown**
   - Dropdown/Select component in the header
   - Options: "All Companies" (default) + list of active companies
   - Client-side filtering or server-side via searchParams
   - When a company is selected, only show postings from that company

3. **Maintains similar UI structure**
   - Card layout with header and content
   - "View All →" link to `/jobs` page
   - Similar spacing and styling to current component

## Relevant Files

- `web/components/dashboard/RecentInsights.tsx` - Rename/refactor to `LatestPostings.tsx` or create new component
- `web/app/(dashboard)/page.tsx` - Update query to fetch `job_postings` instead of `strategic_insights`, add company filter logic
- `web/components/ui/select.tsx` - Existing shadcn/ui Select component (use for dropdown)
- `web/app/(dashboard)/jobs/page.tsx` - Reference for job posting query patterns and structure

## Implementation Notes

### Data Query
- Query `job_postings` table with `companies` join
- Filter: `is_active = true` and `companies.is_active = true`
- Order by: `first_seen_date DESC`
- Limit: 10-15 postings (more than current 5 since these are simpler items)
- Include fields: `id, title, department, location, first_seen_date, companies(name, slug)`

### Company Filter Options
- Fetch list of active companies for dropdown options
- Two approaches:
  1. **Client-side filtering**: Fetch all postings, filter in component (simpler, good for small datasets)
  2. **Server-side filtering**: Use searchParams, refetch on selection (better for large datasets)
- Recommend client-side for initial implementation (can optimize later)

### Component Structure
```tsx
<Card>
  <CardHeader>
    <div className="flex items-center justify-between">
      <h2>Latest Postings</h2>
      <Select>
        <SelectTrigger>All Companies</SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Companies</SelectItem>
          {companies.map(c => <SelectItem value={c.slug}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    <Link href="/jobs">View All →</Link>
  </CardHeader>
  <CardContent>
    {/* Filtered postings list */}
  </CardContent>
</Card>
```

### Type Definitions
```tsx
type JobPosting = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  first_seen_date: string;
  company: {
    name: string;
    slug: string;
  };
};
```

## Risks & Dependencies

- **Low Risk**: This is a UI/data display change, no breaking changes to existing functionality
- **Performance**: If using client-side filtering, ensure dataset size is manageable (consider pagination if needed)
- **Naming**: Consider whether to rename component file or create new one (recommend creating new `LatestPostings.tsx` to avoid breaking changes, then remove old one)
- **Testing**: Verify filtering works correctly, links navigate properly, empty states handled

## Success Criteria

- [ ] RecentInsights component replaced with Latest Postings component
- [ ] Displays recent job postings ordered by first_seen_date
- [ ] Company dropdown filter works (client or server-side)
- [ ] "All Companies" option shows all postings
- [ ] Selecting a company filters to that company's postings only
- [ ] Links navigate to `/jobs/[id]` pages
- [ ] Empty state handled (no postings message)
- [ ] Maintains responsive design and styling consistency
- [ ] "View All →" link works correctly

## Related Documentation

- `web/app/(dashboard)/jobs/page.tsx` - Reference for job posting queries and display patterns
- `CLAUDE.md` - Project structure and component patterns
