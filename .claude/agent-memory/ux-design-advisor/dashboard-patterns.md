# Dashboard UI Patterns & Conventions

## Segmented Pill Control (TimeRangeSelector pattern)
- Used for small sets of mutually exclusive options (2–6 items)
- Markup: `inline-flex items-center rounded-lg border bg-muted p-0.5 text-muted-foreground`
- Active state: `bg-background text-foreground shadow-sm`
- Inactive hover: `hover:bg-background/50 hover:text-foreground`
- Text: `text-xs font-medium` for compact controls, `text-sm font-medium` for page-level controls
- Padding: `px-2.5 py-1` (compact) or `px-3 py-1` (page-level)
- Defined in: `components/dashboard/TimeRangeSelector.tsx`
- Also used in: `components/dashboard/CompaniesOverview.tsx` (MatrixControls)

## Dashboard Page Layout (app/(dashboard)/page.tsx)
- ROW 0: Time Range Selector (right-aligned, controls charts/sparklines/flow chart)
- ROW 1: Stat Cards with sparklines
- ROW 2: Weekly Intel Banner (AI digest narrative)
- ROW 3: Net Hiring Flow Chart (full width)
- ROW 4: Competitive Matrix (lg:col-span-2) + Function Mix donut (1/3)
- ROW 5: Hot Roles Feed (1/2) + Strategy Signals (1/2)
- Page-level time range param: `range` (2w/1m/3m/6m, default 3m)
- Matrix-specific params: `matrixWindow` (current/30/60/90/180/360) + `matrixScope` (active/all)

## Competitive Matrix (CompaniesOverview.tsx)
- 7 function group columns (Engineering, Product & Design, Data & Analytics, Risk/Legal/Compliance, GTM, Finance & Strategy, Ops & People) — "Other" excluded
- Short labels map: Eng, Prod, Data, Risk, GTM, Fin, Ops
- Company column sticky left (bg-card z-10)
- Zero-count cells: `—` with `text-muted-foreground/40`
- Zero-total rows: should use `opacity-50` on TableRow (recommended, not yet implemented)
- 7d Net column: shown in Current mode only (hidden for historical windows)
- Cell color highlighting (green/red bg): Current mode only
- Controls live in CardHeader with responsive stacking: `flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`

## Table Conventions
- Horizontal rules only (no vertical borders) — shadcn Table default
- Row hover via TableRow default hover state
- Sticky first column uses `sticky left-0 bg-card z-10` (must match card background)
- Horizontal scroll wrapper: `overflow-x-auto -mx-6` with inner `min-w-[600px] px-6`
- Numeric cells: `tabular-nums text-center`

## Two-Control Disambiguation Problem (identified)
- Dashboard has two visually identical segmented pills: page-level TimeRangeSelector and matrix MatrixControls
- These control different things (charts vs. matrix data)
- Recommended fix: add a small "Charts" label before the page-level control
- Without labeling, users have no way to know which control affects what

## Known Design Debt
- Page-level TimeRangeSelector has no label — floats unlabeled above dashboard
- Scope toggle labels "Active only" / "Include closed" are asymmetric; recommended: "Open roles" / "All roles"
- `getDescription()` produces awkward copy for active+historical combination: "currently active during the last N days"
