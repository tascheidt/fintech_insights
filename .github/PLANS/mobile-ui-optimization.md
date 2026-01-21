# Mobile UI Optimization Plan

**Overall Progress:** `88%`

## TLDR
Optimize all dashboard and company pages for mobile responsiveness. Fix layout breakpoints, ensure single-column layouts on mobile (<640px), add mobile navigation menu, and ensure all interactive elements meet touch target size requirements (min 44px). Test on actual mobile devices.

## Critical Decisions
- **Breakpoint Strategy**: Use Tailwind's `sm:` (640px), `md:` (768px), `lg:` (1024px) prefixes consistently
- **Mobile-First Approach**: Start with mobile styles, then enhance for larger screens
- **Navigation**: Add hamburger menu for mobile navigation (hide desktop nav on small screens)
- **Grid Collapse**: All multi-column grids collapse to single column on mobile
- **Touch Targets**: Ensure all buttons/links meet 44px minimum tap target size
- **Horizontal Scroll Prevention**: Use `overflow-x-hidden` and proper width constraints

## Tasks

- [x] 🟩 **Step 1: Fix Dashboard Layout & Navigation**
  - [x] 🟩 Update `web/app/(dashboard)/layout.tsx` - Make padding responsive (`p-4 sm:p-6`)
  - [x] 🟩 Update `web/components/layout/DashboardNav.tsx` - Add mobile hamburger menu
  - [x] 🟩 Hide desktop nav links on mobile, show hamburger icon
  - [x] 🟩 Add mobile menu drawer/sheet component for navigation
  - [x] 🟩 Ensure UserMenu is accessible on mobile

- [x] 🟩 **Step 2: Fix Dashboard Page Components**
  - [x] 🟩 Update `web/app/(dashboard)/page.tsx` - Make main grid responsive
  - [x] 🟩 Change `lg:grid-cols-3` to stack on mobile (remove grid, use flex-col)
  - [x] 🟩 Update `web/components/dashboard/StatsCards.tsx` - Ensure cards stack on mobile
  - [x] 🟩 Verify `md:grid-cols-2 lg:grid-cols-4` collapses to single column on mobile
  - [x] 🟩 Update `web/components/dashboard/CompaniesOverview.tsx` - Fix grid collapse
  - [x] 🟩 Change `sm:grid-cols-2 lg:grid-cols-3` to single column on mobile
  - [x] 🟩 Ensure table view is horizontally scrollable on mobile (add wrapper)
  - [x] 🟩 Update `web/components/dashboard/StrategicHighlights.tsx` - Ensure cards stack properly
  - [x] 🟩 Fix any overflow issues in highlight cards

- [x] 🟩 **Step 3: Fix Company Detail Page**
  - [x] 🟩 Update `web/app/(dashboard)/companies/[slug]/page.tsx` - Make tabs responsive
  - [x] 🟩 Ensure TabsList scrolls horizontally on mobile if needed
  - [x] 🟩 Fix overview grid (`sm:grid-cols-2 lg:grid-cols-4`) to single column on mobile
  - [x] 🟩 Update `web/components/companies/JobHistoryView.tsx` - Mobile optimizations
  - [x] 🟩 Ensure card grid collapses to single column
  - [x] 🟩 Make table view horizontally scrollable with wrapper
  - [x] 🟩 Fix filter controls to stack vertically on mobile
  - [x] 🟩 Ensure pagination controls are touch-friendly

- [x] 🟩 **Step 4: Fix Company Insights Page**
  - [x] 🟩 Update `web/app/(dashboard)/companies/[slug]/insights/page.tsx` - Responsive layout
  - [x] 🟩 Fix header flex layout to stack on mobile (`flex-col sm:flex-row`)
  - [x] 🟩 Ensure GenerateInsightButton is accessible on mobile
  - [x] 🟩 Update `web/components/companies/CompanyInsightsCard.tsx` - Mobile-friendly cards
  - [x] 🟩 Fix historical insights list to stack properly
  - [x] 🟩 Ensure action buttons have adequate tap targets

- [x] 🟩 **Step 5: Fix Insights List Page**
  - [x] 🟩 Update `web/app/(dashboard)/insights/page.tsx` - Responsive spacing
  - [x] 🟩 Update `web/components/insights/LatestDigestInsights.tsx` - Mobile layout
  - [x] 🟩 Ensure insight cards stack properly on mobile
  - [x] 🟩 Update `web/components/insights/DigestArchive.tsx` - Mobile-friendly archive
  - [x] 🟩 Fix archive cards/grid to single column on mobile

- [x] 🟩 **Step 6: Fix Shared Components**
  - [x] 🟩 Update `web/components/ui/button.tsx` - Ensure min-height 44px on mobile
  - [x] 🟩 Update `web/components/ui/card.tsx` - Ensure no overflow issues
  - [x] 🟩 Update `web/components/ui/table.tsx` - Add horizontal scroll wrapper utility
  - [x] 🟩 Update `web/components/ui/tabs.tsx` - Ensure tabs scroll horizontally if needed
  - [x] 🟩 Update `web/components/ui/notion-card.tsx` - Mobile-friendly card spacing
  - [x] 🟩 Check all form inputs have adequate touch targets

- [x] 🟩 **Step 7: Global Mobile Fixes**
  - [x] 🟩 Update `web/app/globals.css` - Add mobile-specific utilities if needed
  - [x] 🟩 Ensure no horizontal scrolling on any page (`overflow-x-hidden` on body)
  - [x] 🟩 Add `viewport-fit=cover` meta tag if needed for mobile browsers
  - [x] 🟩 Test text sizes are readable on mobile (min 16px for body text)
  - [x] 🟩 Ensure all modals/dialogs are mobile-friendly

- [ ] 🟥 **Step 8: Testing & Verification**
  - [ ] 🟥 Test on iPhone SE (375px width) - smallest common mobile device
  - [ ] 🟥 Test on iPhone 12/13/14 (390px width) - standard mobile
  - [ ] 🟥 Test on iPad (768px width) - tablet breakpoint
  - [ ] 🟥 Verify no horizontal scrolling on any page
  - [ ] 🟥 Verify all buttons/links meet 44px tap target requirement
  - [ ] 🟥 Test navigation menu on mobile
  - [ ] 🟥 Test all interactive elements (tabs, filters, pagination)
  - [ ] 🟥 Verify cards/tables display correctly in all views
  - [ ] 🟥 Test on actual mobile device (not just browser dev tools)
