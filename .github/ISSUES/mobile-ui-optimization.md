# Mobile UI Optimization

## TL;DR
Dashboard and company insights pages have poor mobile responsiveness - layout elements don't appear correctly or scale properly on mobile devices. Needs immediate attention as users are hitting this.

## Type
**Improvement** - Mobile Responsiveness

## Priority
**High** (users actively affected)

## Effort
**Medium** (CSS/layout changes across multiple components, no new features)

## Current State

### Affected Pages
- **Dashboard** (`/`) - Main dashboard layout breaks on mobile
- **Company Detail** (`/companies/[slug]`) - Content doesn't scale properly
- **Company Insights** (`/companies/[slug]/insights`) - Layout elements missing/broken
- **Insights List** (`/insights`) - Poor mobile scaling

### Issues
- Layout elements don't appear on mobile viewports
- Content doesn't scale properly to smaller screens
- Grid layouts likely not collapsing to single column
- Cards/components may overflow or get cut off
- Navigation may be difficult on touch devices

## Expected Outcome

### Responsive Behavior
- **Mobile (< 640px)**: Single column layouts, stacked cards, touch-friendly tap targets
- **Tablet (640px - 1024px)**: 2-column grids where appropriate
- **Desktop (> 1024px)**: Current layout preserved

### Specific Fixes Needed
1. Dashboard stats cards stack vertically on mobile
2. Company cards in grid collapse to single column
3. Insights cards/tables become scrollable or stack
4. Charts resize appropriately or show simplified mobile view
5. Navigation accessible via mobile menu/hamburger
6. All interactive elements have adequate tap target size (min 44px)

## Relevant Files

```
web/app/(dashboard)/page.tsx          # Main dashboard
web/app/(dashboard)/companies/[slug]/page.tsx    # Company detail
web/app/(dashboard)/companies/[slug]/insights/page.tsx  # Company insights
web/app/(dashboard)/insights/page.tsx  # Insights list
```

Plus any shared layout/component files these pages use.

## Technical Notes

- Project uses Tailwind CSS 4 - leverage responsive prefixes (`sm:`, `md:`, `lg:`)
- shadcn/ui components should be responsive by default, check custom overrides
- Test on actual mobile devices, not just browser dev tools
- Consider touch interactions (swipe, tap) not just layout

## Acceptance Criteria

- [ ] Dashboard fully usable on 375px width (iPhone SE)
- [ ] Company pages render all content on mobile
- [ ] Insights readable and navigable on mobile
- [ ] No horizontal scrolling on any page
- [ ] All buttons/links have adequate tap targets
