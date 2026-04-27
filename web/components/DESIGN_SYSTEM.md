# Design System — token + component reference

This document is the in-codebase source of truth for the visual system. The
ground truth for token *values* is [`web/app/globals.css`](../app/globals.css).
This file explains **what each token is for, when to use it, and which
component embodies the canonical pattern**.

If you can't tell from this doc which token / component to reach for, that's
a doc bug — file it and fix the doc rather than guessing at the call site.

---

## 1. Foundation

### 1.1 Color tokens

All color tokens are CSS variables defined in
[`web/app/globals.css`](../app/globals.css). Tailwind v4 `@theme inline`
re-exposes them as utility classes. Light + dark themes are two `:root`
blocks; nothing else in the codebase needs to know which theme is active.

#### Brand scale — Pacific

The brand blue. `pacific-500` is the core. Use `bg-primary` (semantic alias
to `pacific-500`) by default; reach for the numbered scale only when you
need a specific shade.

| Token | Tailwind | Use |
|---|---|---|
| `--pacific-50` | `bg-pacific-50` | Subtle wash on hover |
| `--pacific-100` | `bg-pacific-100` | Soft surface |
| `--pacific-300` | `bg-pacific-300` | Faded chart series |
| `--pacific-500` | `bg-pacific-500` | Brand mark, primary buttons |
| `--pacific-600` | `bg-pacific-600` | Primary hover |
| `--pacific-700` | `text-pacific-700` | Soft-chip foreground |

#### Warm neutrals — Sand

Replaces grayscale. The body background (`--background`) is `sand-50`.

| Token | Use |
|---|---|
| `sand-50` | App background (warm off-white) |
| `sand-100` | Secondary surface, muted background |
| `sand-200` | Border |
| `sand-600` | Muted-foreground text |
| `sand-800` | Dense text on light surface |

#### Accent — Sunset

Warm accent. Used for moderate alignment, hot-roles indicators, and
chart-3 (slowdown). **Never use this for errors.**

| Token | Use |
|---|---|
| `sunset-400/500/600` | Accent, slowdown bar, "moderate" alignment dot |

#### Highlight — Sun

| Token | Use |
|---|---|
| `sun-400/500/600` | Sparing highlights, "contradicting" alignment, chart-4 |

#### Growth

| Token | Use |
|---|---|
| `growth-500` | Strong alignment, net-positive hiring number |

**Do not use ad-hoc Tailwind greens.** `text-green-600` is forbidden by the
lint rule.

### 1.2 Semantic aliases

These are what most components should reach for. They re-map to the brand
tokens above, and remap again under `.dark`.

| Alias | Light value | Use |
|---|---|---|
| `--primary` | `pacific-500` | Brand actions, links |
| `--primary-soft` / `--primary-soft-foreground` | tinted | Chip / callout |
| `--accent` | `sunset-500` | Warm accents, moderate alignment |
| `--accent-soft` / `--accent-soft-foreground` | tinted | "New" chips, slowdown tints |
| `--highlight` / `--highlight-soft` | sun | Sparing visual highlights |
| `--muted` / `--muted-foreground` | sand | De-emphasized text + surfaces |
| `--secondary` | sand-100 | Hover surface |
| `--destructive` | red | True error states only |
| `--border`, `--input`, `--ring` | sand-200, sand-200, pacific-400 | Form chrome |

### 1.3 Charts

Always reference `--chart-1..5`. Never hardcode hex.

| Token | Color | When |
|---|---|---|
| `--chart-1` | Pacific 500 | Primary series |
| `--chart-2` | Pacific 300 | Faded / secondary series |
| `--chart-3` | Sunset 500 | Negative / slowdown bar |
| `--chart-4` | Sun 500 | Highlight series |
| `--chart-5` | Growth 500 | Net-positive only |

Tick labels: `fontFamily: "var(--font-mono)"`, `fontSize: 11`,
`fill: "var(--muted-foreground)"`.

### 1.4 Gradients

Two gradients exist. They are reserved for editorial moments. Never use as
background for product chrome.

| Token | Use |
|---|---|
| `--gradient-coast` | DigestBanner, marketing hero, login aside |
| `--gradient-dawn` | Reserved (future editorial moment) |

Tailwind v4 doesn't tokenize gradients yet. Apply inline:

```tsx
<div style={{ background: "var(--gradient-coast)" }}>
```

### 1.5 Type

Three families:

| Family | Variable | Use |
|---|---|---|
| Sans (Geist) | `--font-sans` | Body, UI chrome |
| Mono (Geist Mono) | `--font-mono` | Eyebrows, timestamps, tick labels, tabular numbers |
| Display (Fraunces) | `--font-display` | Editorial only |

**Display font is restricted.** Allowed surfaces:

- Digest hero headline (`WeeklyIntelBanner`)
- Marketing hero (`/`)
- Login hero (`/login`)
- Company stated-strategy callout (`/companies/[slug]`)

Forbidden everywhere else — UI chrome, charts, tables, labels, buttons.

Two utilities are exposed in `globals.css`:

```css
.font-display { font-family: var(--font-display); }
.text-display { /* family + weight 600 + tight tracking + tight leading */ }
```

### 1.6 Radii + shadows

Radii: `--radius-sm` through `--radius-4xl`, all derived from `--radius`
(default `0.625rem`). Cards in this system use `rounded-[10px]` to match
the design preview. shadcn defaults are fine for primitives.

Shadows: `--shadow-xs/sm/md/lg`. Apply to elevated surfaces sparingly.

---

## 2. Component canon

The components below are the contract. When in doubt, copy them.

### Layout

| Component | File | Notes |
|---|---|---|
| `DashboardNav` | `layout/DashboardNav.tsx` | Brand mark + wordmark + Pacific underline on active link + Labs pill + avatar |
| `UserMenu` | `layout/UserMenu.tsx` | 30×30 round avatar, `bg-pacific-500` |

### Dashboard widgets

| Component | File | Visual contract |
|---|---|---|
| `WeeklyIntelBanner` | `dashboard/WeeklyIntelBanner.tsx` | Coast gradient, Fraunces 26px headline, mono eyebrow, ghost CTA |
| `StatsCards` | `dashboard/StatsCards.tsx` | Plain cards (no shadcn Card), 26px tabular-nums, growth/sunset for net |
| `HotRolesFeed` | `dashboard/HotRolesFeed.tsx` | 22×22 avatar, "new" chip <48h, mono time |
| `StrategySignals` | `dashboard/StrategicHighlights.tsx` | 7px alignment dot, mono eyebrow |
| `HiringChart` | `dashboard/HiringChart.tsx` | `var(--chart-1)` bars, mono tick labels |
| `CompetitiveMatrix` | `dashboard/CompaniesOverview.tsx` | `bg-primary-soft/40` for positive cell tint |

### Editorial / digest

| Component | File | Notes |
|---|---|---|
| `SignalsTimeline` | `digests/SignalsTimeline.tsx` | Vertical or responsive variant; alignment dot + mono eyebrow |

### Feedback / utility

| Component | File | Notes |
|---|---|---|
| `EmptyState` | `feedback/EmptyState.tsx` | Single source for empty / waiting / warn surfaces |

---

## 3. Patterns

### 3.1 Chip system

A chip is a 10-12px uppercase mono label with rounded background. Three
variants:

```tsx
// Brand / strong / verified
<span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary-soft text-primary-soft-foreground">
  strong
</span>

// Warm / moderate / new
<span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent-soft text-accent-soft-foreground">
  new
</span>

// Neutral
<span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
  weak
</span>
```

### 3.2 Alignment / signal strength

| Strength | Dot | Chip |
|---|---|---|
| `strong` | `bg-growth-500` | brand-soft |
| `moderate` | `bg-accent` | accent-soft |
| `weak` | `bg-muted-foreground` | muted |
| `contradicting` | `bg-highlight` | highlight-soft |

### 3.3 Number rendering

- Always `tabular-nums`.
- Positive net hiring: `text-growth-500`. Negative: `text-sunset-600`.
- Never `text-green-*` / `text-red-*` from Tailwind's default palette.

### 3.4 Editorial moment

The four editorial surfaces (digest hero, marketing hero, login hero,
stated-strategy callout) follow a shared pattern:

```tsx
<div style={{ background: "var(--gradient-coast)" /* or none */ }}>
  <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-primary">
    Eyebrow
  </p>
  <h2 className="font-display font-semibold text-[26px] tracking-[-0.012em] leading-[1.18]">
    Editorial headline
  </h2>
  <p className="text-sm text-muted-foreground">…meta…</p>
</div>
```

CTAs on editorial surfaces are **ghost** (`border + bg-transparent`), not
primary fill. The fill would steamroll the editorial moment.

---

## 4. v2 primitives + page surfaces

Wave 2 introduced 7 small, single-purpose primitives in
[`web/components/design/`](./design/) that are shared across the v2
page rebuilds (Companies index, company drill-down, Jobs). Reach for
these before inventing a new visual element. Import from the barrel:

```tsx
import {
  Sparkline,
  PivotChip,
  CoverageStrip,
  SignalTag,
  FunctionDot,
  ConfidenceBars,
  MonogramAvatar,
} from "@/components/design";
```

### 4.1 Primitives

| Primitive | File | Props (summary) | When to use it |
|---|---|---|---|
| `Sparkline` | `design/Sparkline.tsx` | `data: number[]`, `kind?: "new" \| "accel" \| "quiet" \| "cont"`, `width?`, `height?` | Tiny inline trend strip on a Companies index row or a Strategic Bet card. Color comes from `kind`, not from the call site. |
| `PivotChip` | `design/PivotChip.tsx` | `kind: "new" \| "accel" \| "quiet" \| "cont"`, `label: string` | Mono uppercase chip with a Lucide icon describing how a company's hiring is pivoting this week. Used on the Companies index and on Bet cards. |
| `CoverageStrip` | `design/CoverageStrip.tsx` | `kind: PivotKind` | 4px-wide colored strip rendered inside a Companies index row to telegraph pivot status at a glance. `aria-hidden`; the chip is the canonical signal. |
| `SignalTag` | `design/SignalTag.tsx` | `children: ReactNode` | Small mono lowercase chip for inline keyword tags inside job rows ("payments rails", "Go", "bilingual"). |
| `FunctionDot` | `design/FunctionDot.tsx` | `fn: string` | 7px color-coded dot beside a job title indicating the function group. Maps RoleCategory and informal labels to a `bg-cat-*` token. |
| `ConfidenceBars` | `design/ConfidenceBars.tsx` | `value: 1..5` | 5-segment editorial-confidence indicator on Strategic Bet cards. |
| `MonogramAvatar` | `design/MonogramAvatar.tsx` | `name: string`, `size?: "sm" \| "md" \| "lg" \| number` | Size-variant wrapper over `CompanyAvatar`. Don't fork the avatar palette — use this. |

### 4.2 v2 surfaces

Three page surfaces were rebuilt in Waves 3/J/K/L. Treat the
implementations below as the canonical reference; don't reach for the
original `/tmp/design-package-v2/.../*.jsx` specs once they age out.

**Jobs (list-first).** A sortable table of every recent posting, plus a
contextual right rail that shows function heat (30-day net) and
cross-company themes. Data: `getJobsForBet`-style queries plus
`getFunctionHeatData` and `getCrossCompanyThemes` from
`web/lib/dashboard-queries.ts`. Canonical files:
[`web/components/jobs/JobsHeader.tsx`](./jobs/JobsHeader.tsx),
[`JobsListTable.tsx`](./jobs/JobsListTable.tsx),
[`JobsRail.tsx`](./jobs/JobsRail.tsx),
[`JobsPageClient.tsx`](./jobs/JobsPageClient.tsx).

**Companies index (signal-rich list).** Each row is an editorial line
that carries the company's working thesis, a hiring sparkline, a
PivotChip, and the most recent meaningful change. Data: company list
joined with `getCompanyHiringSparkline`, `classifyCompanyPivot`, and
`getCompanyLastChange`. Canonical files:
[`web/components/companies/CompaniesIndexRow.tsx`](./companies/CompaniesIndexRow.tsx),
[`CompaniesLens.tsx`](./companies/CompaniesLens.tsx),
[`CompaniesViewToggle.tsx`](./companies/CompaniesViewToggle.tsx).

**Company drill-down (bets-first).** Working thesis at the top, then a
ranked stack of Strategic Bets. Each Bet bundles the claim, hiring
evidence (internal) plus news (external), confidence, associated jobs
(via the in-page `JobsScopeDrawer`), and a forward signal. Data:
`getCompanyDrillDownData` plus `getJobsForBet`. Canonical files:
[`web/components/companies/WorkingThesisCard.tsx`](./companies/WorkingThesisCard.tsx),
[`StrategicBetCard.tsx`](./companies/StrategicBetCard.tsx),
[`JobsScopeDrawer.tsx`](./companies/JobsScopeDrawer.tsx),
[`CompanyOverviewBets.tsx`](./companies/CompanyOverviewBets.tsx),
[`CompanyHeaderPill.tsx`](./companies/CompanyHeaderPill.tsx).

### 4.3 `companies.bets` shape

The drill-down reads from `companies.bets` (JSONB, added in
`web/supabase/migrations/20260425_company_editorial_v2.sql`). Editors
populate it via `EditCompanyEditorialForm`. Each bet is:

```ts
{
  id: string;
  title: string;
  claim: string;                  // one-line thesis for this bet
  pivot: "new" | "accel" | "cont" | "quiet";
  confidence: 1 | 2 | 3 | 4 | 5;  // editorial conviction
  evidence: Array<{
    when: string;                 // ISO date
    text: string;
    type: "internal" | "external";
  }>;
  forward_signal: string;         // what we'd expect to see next
  job_filter: {
    function?: string;            // RoleCategory or category-group label
    theme?: string;               // free-text token for cross-company match
  };
}
```

The drill-down ranks bets by hiring evidence weight. The
`JobsScopeDrawer` reads `job_filter` to scope its query.

### 4.4 Pivot classifier rules

`classifyCompanyPivot` (in `web/lib/dashboard-queries.ts`) returns one
of `"new" | "accel" | "quiet" | "cont"` from a company's recent hiring
history. The thresholds:

- **`new`** — first posting in a function in 6+ months ("cold start").
- **`accel`** — 7-day rolling volume exceeds 2× the 12-week baseline
  ("volume spike").
- **`quiet`** — sustained baseline drops to 0 postings for 30+ days
  ("going quiet").
- **`cont`** — continuity; no signal worth surfacing.

These are also the four `kind` values accepted by `Sparkline`,
`PivotChip`, and `CoverageStrip`, so the same classifier output flows
straight through the visual layer.

---

## 5. Drift prevention

- **Lint rule**: `design-system/no-raw-color` (in `eslint-rules/no-raw-color.js`).
  Currently `warn`; promote to `error` after the SoCal migration is complete.
- **Stylelint** (recommended): `color-no-hex`, `color-named: never` on
  `web/components/**/*.css` and `web/app/**/*.css`, excluding `globals.css`.
- **PR review**: any new file with a Tailwind arbitrary color (`bg-[#…]`),
  raw OKLCH, or one of the forbidden Tailwind palette colors should be
  rejected.

---

## 6. Adding a new token

1. Open [`web/app/globals.css`](../app/globals.css).
2. Add the variable under the right `:root` block (and `.dark` if it should
   theme).
3. If you want it as a Tailwind utility, add a corresponding entry to the
   `@theme inline` block (`--color-<name>: var(--<name>);`).
4. Document it in section 1 of this file under the right family.
5. Add or update the canonical component (section 2 or 4) so people see it
   in use.

That's it. The lint rule does not need to change — it permits any
`var(--…)` reference.

---

## 7. Working with the design system project

The Talent Brief design system project (a separate codebase) is the
visual source of truth. The `handoff/` folder at the repo root contains
the original migration package:

- `handoff/README.md` — high-level principles
- `handoff/MIGRATION.md` — phase order
- `handoff/COMPONENT_DIFFS.md` — per-component spec
- `handoff/NEW_ROUTES.md` — new screens
- `handoff/lint-rule-no-raw-color.md` — drift prevention

When the design system evolves, update tokens here AND keep this doc + the
canonical components in sync. The `handoff/` folder is the historical
artifact of the initial migration; ongoing changes live in this codebase.
