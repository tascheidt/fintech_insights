# Comprehensive UI/UX Redesign: User-Focused Dashboard Flow

## TL;DR
Complete redesign of the application flow to prioritize user experience with personalized welcome, high-level insights overview, improved company pages with job history, and dedicated weekly insights digest page. Remove standalone Jobs and Templates pages.

## Type
**Feature** - Major UX Improvement

## Priority
**High** (fundamental user experience improvement)

## Effort
**Large** (multi-page redesign, navigation restructure, new components)

## Current State

### Navigation Structure
- Dashboard (home) - shows stats cards, recent insights, hiring chart
- Insights - list of all insights with filters
- Companies - list of companies
- Jobs - standalone page listing all jobs (to be removed)
- Templates - standalone page for job templates (to be removed)
- Admin - admin controls

### Issues
- No personalized welcome experience
- Dashboard doesn't provide clear high-level overview of what's being tracked
- Jobs and Templates are top-level pages but should be accessed through company context
- Weekly digests not prominently featured
- No clear flow from overview → company detail → job history

## Expected Outcome

### 1. Welcome Experience
- **Every login**: Non-intrusive personalized welcome message (small banner/bar, not taking up significant page space)
- Should include user's name/email and brief orientation
- Subtle, dismissible, or auto-collapses after a few seconds

### 2. Redesigned Dashboard (Home Page)
High-level overview serving as the "well" of information:

**Top Section:**
- Welcome message (if not first login, can be subtle)
- Quick stats overview

**Main Content:**
- **Companies Being Tracked**
  - **Card view (default)**: Notion-style cards showing:
    - Company name/logo
    - Job count per company
    - Highlights/summaries of recent job postings
    - Visual, clean card layout similar to Notion
  - **Toggle to table view**: Switch between card and table views (like Notion's view switcher)
  - List/grid of all active companies
- **Weekly Digests**
  - List of weekly digests (most recent first) - data already exists in database
  - Quick preview/summary of each digest
  - Link to full digest view

### 3. Enhanced Company Pages
- **Current Jobs Section**
  - **Card view (default)**: Notion-style cards for each job posting
  - **Toggle to table view**: Switch between card and table views
  - All jobs currently posted by the company
  - Clear active/inactive status
- **Job History Section**
  - **Card view (default)**: Notion-style cards for historical jobs
  - **Toggle to table view**: Switch to table for easier filtering/searching
  - Searchable/filterable view of all previous jobs
  - Filters (work in both views):
    - Active vs Inactive roles
    - Time period (date range selector)
    - Job title/keyword search
  - Dropdowns for easy filtering
- Remove need to navigate to separate Jobs page

### 4. Insights Page Redesign
- **Top Section**: Latest insights for each company from most recent digest run
  - Grouped by company
  - Show date/time of last digest generation
- **Below**: Archived Digests
  - List of all weekly digests (chronological, newest first)
  - Each digest shows:
    - Date/week period
    - Companies included
    - Key highlights
  - Click to view full digest details

### 5. Navigation Cleanup
- Remove `/jobs` page from navigation
- Remove `/templates` page from navigation
- Jobs accessible via company pages
- Templates accessible via company pages (if still needed)

## Files to Modify

### New Components Needed
- `web/components/dashboard/WelcomeMessage.tsx` - Non-intrusive personalized welcome banner
- `web/components/dashboard/CompaniesOverview.tsx` - Companies list with card/table view toggle (Notion-style)
- `web/components/dashboard/WeeklyDigestsList.tsx` - List of weekly digests (data from database)
- `web/components/companies/JobHistoryView.tsx` - Job history with card/table view toggle (Notion-style)
- `web/components/companies/ViewToggle.tsx` - Reusable card/table view switcher (Notion-style)
- `web/components/ui/NotionCard.tsx` - Base Notion-style card component
- `web/components/insights/DigestArchive.tsx` - Archive of weekly digests
- `web/components/insights/LatestDigestInsights.tsx` - Latest insights grouped by company

### Pages to Modify
- `web/app/(dashboard)/page.tsx` - Complete redesign of dashboard
- `web/app/(dashboard)/companies/[slug]/page.tsx` - Add job history section
- `web/app/(dashboard)/insights/page.tsx` - Redesign for digest-focused view

### Pages to Remove/Deprecate
- `web/app/(dashboard)/jobs/page.tsx` - Remove (functionality moved to company pages)
- `web/app/(dashboard)/jobs/[id]/page.tsx` - May keep for deep linking, but remove from nav
- `web/app/(dashboard)/templates/page.tsx` - Remove (functionality moved to company pages)
- `web/app/(dashboard)/templates/[category]/page.tsx` - Remove

### Navigation Updates
- `web/components/layout/DashboardNav.tsx` - Remove Jobs and Templates links

### API Routes (if needed)
- May need new endpoints for:
  - Weekly digest data
  - Job history with filters
  - Company job highlights

## Implementation Notes

### Data Considerations
- Weekly digest data already exists in database (no new generation needed)
- Job history queries may need optimization for filtering
- Consider pagination for both card and table views
- Need to query digest data from existing database tables

### User Experience Flow
1. User logs in → Welcome message
2. Dashboard shows overview → Companies + Digests
3. User clicks company → See current jobs + job history
4. User clicks Insights → See latest digest + archive

### Migration Strategy
- Can be done incrementally:
  1. Add welcome message to dashboard
  2. Redesign dashboard layout
  3. Enhance company pages with job history
  4. Redesign insights page
  5. Remove old Jobs/Templates pages last

## Design Requirements

### UI/UX Style
- **Notion-inspired design**: Cards should mimic Notion's clean, modern card aesthetic
- **View Toggle**: All list views should support card ↔ table view switching (like Notion)
- **Welcome Message**: Non-intrusive, small banner that doesn't dominate the page

### Remaining Questions
- [ ] Should templates still exist at all, or completely remove?
- [ ] Do we need to preserve deep links to `/jobs/[id]` pages for external references?
- [ ] What database tables store the weekly digest data? (Need to verify schema)

## Dependencies
- Weekly digest data already exists in database (verify table structure)
- Job history data availability
- User profile data for personalized welcome
- Notion-style card component library or custom implementation

## Risk Assessment
- **Medium Risk**: Major navigation changes may confuse existing users
- **Mitigation**: Can implement incrementally, keep old routes temporarily with redirects
- **Breaking Changes**: Removing Jobs/Templates pages - ensure all internal links updated
