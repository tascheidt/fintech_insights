# Components — design system primer

This file is the entry point for anyone touching the UI. Read it before
building or modifying a screen.

## ⚑ The single rule

**Every visual value is a token. No raw hex, rgb, hsl, or oklch literals
outside `web/app/globals.css`.**

Why: tokens give us consistency, one-line global changes, dark-mode-by-default,
and reviewable PRs. The day someone hardcodes `bg-[#0ea5e9]` is the day the
design system starts dying.

```tsx
// ❌ Wrong
<div style={{ background: "#0ea5e9" }}>
<button className="bg-[#1d4ed8] text-white">

// ✅ Right — Tailwind token
<div className="bg-primary text-primary-foreground rounded-lg">
<button className="bg-pacific-700 text-white">

// ✅ Right — CSS variable (use for gradients / cases Tailwind can't reach)
<div style={{ background: "var(--gradient-coast)" }}>
```

If a color you need does not exist in the system, **add a token to
`globals.css`**. Do not hardcode at the call site.

The `design-system/no-raw-color` ESLint rule (`web/eslint-rules/no-raw-color.js`)
warns on violations during `npm run lint`. It is currently `warn` to let the
SoCal migration land without CI noise — promote to `error` once Phase 3 + 4
are complete.

---

## Where things live

```
web/
├── app/
│   ├── globals.css            ← THE source of truth for all tokens
│   ├── layout.tsx             ← font loading (Geist, Geist Mono, Fraunces)
│   ├── (auth)/login/          ← logged-out auth surfaces
│   ├── (dashboard)/           ← authenticated app (signed-in users land on /dashboard)
│   └── (marketing)/           ← public marketing landing — now mounted at the root URL `/`
│
├── components/
│   ├── README.md              ← you are here
│   ├── DESIGN_SYSTEM.md       ← full token + component reference
│   ├── ui/                    ← shadcn/ui primitives (Button, Card, …)
│   ├── layout/                ← DashboardNav, UserMenu
│   ├── design/                ← v2 shared primitives — Sparkline, PivotChip,
│   │                            CoverageStrip, SignalTag, FunctionDot,
│   │                            ConfidenceBars, MonogramAvatar (barrel: index.ts)
│   ├── dashboard/             ← StatsCards, WeeklyIntelBanner, HotRolesFeed,
│   │                            StrategySignals, HiringChart, CompetitiveMatrix
│   ├── digests/               ← DigestViewer, SignalsTimeline
│   ├── feedback/              ← EmptyState, FeedbackDialog, FeedbackHistory
│   ├── jobs/                  ← v2 list-first surface — JobsHeader, JobsListTable,
│   │                            JobsRail, JobsPageClient (+ ProcessingJobModal,
│   │                            TaskProgressBar)
│   └── companies/             ← v2 signal-rich list + bets-first drill-down —
│                                CompaniesIndexRow, CompaniesLens,
│                                CompaniesViewToggle, WorkingThesisCard,
│                                StrategicBetCard, JobsScopeDrawer,
│                                CompanyOverviewBets, CompanyHeaderPill
│
└── eslint-rules/
    └── no-raw-color.js        ← drift prevention
```

---

## Design tokens at a glance

Full reference: [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md).

| Token family | What it's for | Examples |
|---|---|---|
| `pacific-50..950` | Brand blue scale (deep ocean) | `bg-pacific-500`, `text-pacific-700` |
| `sand-0..950`     | Warm neutral surfaces (replaces grayscale) | `bg-sand-25`, `text-sand-700` |
| `sun-50..900`     | **Accent family** — CTAs, accent dots | `bg-sun-500` |
| `sunset-50..900`  | **Highlight family** — "new this week", alerts | `bg-sunset-500` |
| `primary`, `accent`, `muted`, `highlight`, `destructive`, … | Semantic aliases | `bg-primary`, `text-muted-foreground` |
| `*-soft` / `*-soft-foreground` | Chip / callout backgrounds | `bg-accent-soft text-accent-soft-foreground` |
| `chart-1..5`     | Recharts series — Pacific / Sunset / Sun / Teal / Magenta | `fill="var(--chart-1)"` |
| `cat-engineering`, `cat-product`, … | 8-category function palette | `bg-cat-engineering` |
| `gradient-coast`, `gradient-dawn` | Editorial bleeds (digest / login / marketing only) | `style={{ background: "var(--gradient-coast)" }}` |
| `font-sans`, `font-mono`, `font-display` | Type families (Geist, Geist Mono, Fraunces) | `font-display`, `font-mono` |

### ⚑ Accent vs Highlight (do not confuse)

The single most often-misimplemented part of the system:

- **Sun (`--accent`)** is warm CTA energy — high-affinity buttons (Send digest,
  Generate insight), Labs pill dot. Yellow.
- **Sunset (`--highlight`)** is the CHANGE marker — "new this week" pips,
  alert chips, chart-2 sunset series. Orange/coral.

Sun is calmer; Sunset is louder. **Do not swap them.**

### Color use rules

- **Negatives in charts and stats** use `sun-*` or `sunset-*`, NOT `destructive`.
  A hiring slowdown is not an error.
- **`destructive` is reserved** for true error states (failed save, validation
  error, dangerous-button confirmation).
- **No ad-hoc Tailwind greens / reds.** `text-green-600`, `bg-emerald-100`,
  `text-red-500` etc. are forbidden. Reach for tokens.
- **Editorial display font (Fraunces, `font-display`)** is restricted to:
  - Digest hero headlines
  - Marketing hero
  - Login hero
  - Company stated-strategy callout
  Never on UI chrome, charts, tables, labels, or buttons.

---

## Adding a new component

1. **Reach for a token first.** If it doesn't exist, open `globals.css` and
   add it under the right scale, then rebuild.
2. **Don't reinvent shadcn primitives.** `web/components/ui/` already has
   Button, Card, Tabs, Dialog, etc. Compose, don't fork.
3. **Use `cn()` from `@/lib/utils`** for conditional classes.
4. **Editorial vs. chrome.** Decide upfront whether the surface is editorial
   (digest, marketing, hero) or chrome (table, sidebar, form). Display font,
   gradients, and pull-quotes belong only to editorial.
5. **Document any new token** in `DESIGN_SYSTEM.md` so the next person can
   find it.

## Modifying an existing component

If you find yourself wanting to change a color in a component:

- Want **all instances** to change? Edit the token in `globals.css`. One line,
  hundreds of usages updated.
- Want **just this one place** to look different? Push back. The whole point
  is that we don't have one-offs. If it's truly necessary, justify it in the
  PR and add a comment at the call site.

---

## Doc hygiene

Per the root `CLAUDE.md` section 9, any PR that:

- adds a token,
- changes the editorial-vs-chrome boundary,
- introduces a new shared visual primitive,
- or changes the lint rule's strictness,

…must update `web/components/DESIGN_SYSTEM.md` in the same PR. Reviewers
reject silent drift.
