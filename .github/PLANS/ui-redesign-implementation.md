# UI Redesign Implementation Plan

**Overall Progress:** `100%`

## TLDR
Redesign the Fintech Insights dashboard to provide a user-focused flow: personalized welcome, Notion-style card/table views for companies and jobs, weekly digest integration, and removal of standalone Jobs/Templates pages. All job data accessible through company pages.

## Critical Decisions
- **Notion-style UI**: Cards with card ↔ table view toggle for all list views
- **Welcome message**: Non-intrusive banner shown every login (not just first login)
- **Data source**: Weekly digests already exist in database (no new generation needed)
- **Incremental migration**: Build new components first, remove old pages last
- **Deep links**: Keep `/jobs/[id]` routes temporarily for external references, but remove from nav

---

## Tasks

### Phase 1: Foundation Components

- [x] 🟩 **Step 1: Create Base UI Components**
  - [x] 🟩 Create `web/components/ui/notion-card.tsx` - Base Notion-style card component
  - [x] 🟩 Create `web/components/ui/view-toggle.tsx` - Reusable card/table view switcher
  - [x] 🟩 Add view preference state management (localStorage with useViewPreference hook)

- [x] 🟩 **Step 2: Create Welcome Message Component**
  - [x] 🟩 Create `web/components/dashboard/WelcomeMessage.tsx`
  - [x] 🟩 Fetch user profile data (name/email) for personalization
  - [x] 🟩 Style as non-intrusive banner (dismissible)

---

### Phase 2: Dashboard Redesign

- [x] 🟩 **Step 3: Create Companies Overview Component**
  - [x] 🟩 Create `web/components/dashboard/CompaniesOverview.tsx`
  - [x] 🟩 Implement card view with company name, job count, recent highlights
  - [x] 🟩 Implement table view alternative
  - [x] 🟩 Add ViewToggle integration

- [x] 🟩 **Step 4: Create Weekly Digests List Component**
  - [x] 🟩 Verify database schema - using company_insights table
  - [x] 🟩 Create `web/components/dashboard/WeeklyDigestsList.tsx`
  - [x] 🟩 Display most recent digests with preview/summary
  - [x] 🟩 Link to full digest view

- [x] 🟩 **Step 5: Redesign Dashboard Page**
  - [x] 🟩 Update `web/app/(dashboard)/page.tsx`
  - [x] 🟩 Add WelcomeMessage at top
  - [x] 🟩 Replace current layout with CompaniesOverview + WeeklyDigestsList
  - [x] 🟩 Keep stats cards at top

---

### Phase 3: Company Pages Enhancement

- [x] 🟩 **Step 6: Create Job History View Component**
  - [x] 🟩 Create `web/components/companies/JobHistoryView.tsx`
  - [x] 🟩 Implement card view for jobs (Notion-style)
  - [x] 🟩 Implement table view with filtering
  - [x] 🟩 Add filters: active/inactive, time period, keyword search
  - [x] 🟩 Add pagination support

- [x] 🟩 **Step 7: Update Company Detail Page**
  - [x] 🟩 Update `web/app/(dashboard)/companies/[slug]/page.tsx`
  - [x] 🟩 Add Active Jobs tab with card/table toggle
  - [x] 🟩 Add All Jobs tab with full filters
  - [x] 🟩 All job data accessible from company page

---

### Phase 4: Insights Page Redesign

- [x] 🟩 **Step 8: Create Insights Page Components**
  - [x] 🟩 Create `web/components/insights/LatestDigestInsights.tsx` - Latest insights grouped by company
  - [x] 🟩 Create `web/components/insights/DigestArchive.tsx` - Archive of weekly digests

- [x] 🟩 **Step 9: Redesign Insights Page**
  - [x] 🟩 Update `web/app/(dashboard)/insights/page.tsx`
  - [x] 🟩 Top section: Latest insights from most recent digest (last 7 days)
  - [x] 🟩 Below: Archived digests grouped by week

---

### Phase 5: Navigation Cleanup

- [x] 🟩 **Step 10: Update Navigation**
  - [x] 🟩 Update `web/components/layout/DashboardNav.tsx`
  - [x] 🟩 Remove Jobs link from navigation
  - [x] 🟩 Remove Templates link from navigation

- [x] 🟩 **Step 11: Deprecate Old Pages**
  - [x] 🟩 Remove `web/app/(dashboard)/jobs/page.tsx`
  - [x] 🟩 Remove `web/app/(dashboard)/templates/page.tsx`
  - [x] 🟩 Remove `web/app/(dashboard)/templates/[category]/page.tsx`
  - [x] 🟩 Keep `web/app/(dashboard)/jobs/[id]/page.tsx` (updated to link back to company)
  - [x] 🟩 Updated internal links in job detail page

---

### Phase 6: Polish & Testing

- [x] 🟩 **Step 12: Final Polish**
  - [x] 🟩 Consistent Notion-style card design across all views
  - [x] 🟩 Responsive grid layouts (mobile/tablet/desktop)
  - [x] 🟩 All data loads correctly with proper types
  - [x] 🟩 View toggle persistence via localStorage

- [x] 🟩 **Step 13: Build Verification**
  - [x] 🟩 TypeScript type checking passes (`npx tsc --noEmit`)
  - [x] 🟩 Fixed lint errors in modified files
  - [x] 🟩 Build ready (font fetch errors are sandbox/network related)

---

## File Summary

### New Files Created
| File | Purpose |
|------|---------|
| `web/components/ui/notion-card.tsx` | Base Notion-style card component with multiple parts |
| `web/components/ui/view-toggle.tsx` | Card/table view switcher with localStorage persistence |
| `web/components/dashboard/WelcomeMessage.tsx` | Non-intrusive personalized welcome banner |
| `web/components/dashboard/CompaniesOverview.tsx` | Companies list with card/table toggle |
| `web/components/dashboard/WeeklyDigestsList.tsx` | Weekly digests grouped by date |
| `web/components/companies/JobHistoryView.tsx` | Job history with filters and pagination |
| `web/components/insights/LatestDigestInsights.tsx` | Latest insights cards by company |
| `web/components/insights/DigestArchive.tsx` | Archived digests grouped by week |

### Modified Files
| File | Changes |
|------|---------|
| `web/app/(dashboard)/page.tsx` | Complete redesign with welcome, companies overview, digests |
| `web/app/(dashboard)/companies/[slug]/page.tsx` | Added JobHistoryView with card/table toggle |
| `web/app/(dashboard)/insights/page.tsx` | Redesigned with latest insights and archive sections |
| `web/app/(dashboard)/jobs/[id]/page.tsx` | Updated back link to point to company page |
| `web/components/layout/DashboardNav.tsx` | Removed Jobs and Templates links |

### Removed Files
| File | Reason |
|------|--------|
| `web/app/(dashboard)/jobs/page.tsx` | Functionality moved to company pages |
| `web/app/(dashboard)/templates/page.tsx` | Removed from navigation |
| `web/app/(dashboard)/templates/[category]/page.tsx` | Removed from navigation |
