# Feature Implementation Plan

**Overall Progress:** `0%`

## TLDR
Rework the application's Information Architecture (IA) to improve navigation, feature discoverability (specifically Settings and Reports), and optimize the Dashboard layout for better user flow.

## Critical Decisions
- **Decision 1: Explicit Settings Navigation** - Add "Settings" to the primary navigation structure rather than hiding it solely in the user menu, addressing the discoverability issue.
- **Decision 2: Dashboard Grid Layout** - Transition the dashboard from a simple vertical stack to a responsive grid layout to better present high-priority information like Strategic Highlights alongside operational data.
- **Decision 3: Navigation Grouping** - Structure navigation into logical groups (e.g., "Platform" vs "System") to reduce cognitive load as the feature set grows.

## Tasks:

- [ ] 🟥 **Step 1: Navigation Restructure**
  - [ ] 🟥 Update `DashboardNav.tsx` to include a direct "Settings" link.
  - [ ] 🟥 Implement logical grouping for navigation items (Dashboard, Insights, Companies | Settings, Admin).
  - [ ] 🟥 Ensure the mobile navigation menu reflects these changes and remains accessible.

- [ ] 🟥 **Step 2: Dashboard Layout Redesign**
  - [ ] 🟥 Refactor `web/app/(dashboard)/page.tsx` to use a responsive grid layout (CSS Grid/Flex).
  - [ ] 🟥 Elevate `StrategicHighlights` visibility (e.g., move to top or give more prominent space).
  - [ ] 🟥 Optimize `StatsCards` placement to serve as a quick status summary.
  - [ ] 🟥 Review and adjust `CompaniesOverview` to fit the new grid structure.

- [ ] 🟥 **Step 3: Feature Discoverability & Page Consistency**
  - [ ] 🟥 Evaluate "Reports" accessibility - if it exists as a feature, ensure it has a clear entry point.
  - [ ] 🟥 Verify `web/app/(dashboard)/settings/page.tsx` is fully functional and aligns with its promoted visibility.
  - [ ] 🟥 Review `Companies` and `Insights` page layouts for consistency with the new Dashboard design language.
