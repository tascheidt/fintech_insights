# COMPONENT_DIFFS.md — Existing components

For each shared component already in `web/components/`, this is the structural
delta vs. the approved design system. Component-by-component, with the source
of truth in this project listed first.

When in doubt, **the JSX file in `ui_kits/talent_brief/` is the contract.**
Translate its structure faithfully; don't simplify.

---

## 1. Layout & Nav

**Source of truth:** `ui_kits/talent_brief/Nav.jsx`
**Current code:** `web/components/layout/DashboardNav.tsx` (and likely a layout wrapper)

### Changes

| Before | After |
|---|---|
| Grayscale `--primary` for active link underline | `bg-primary` (Pacific 500) |
| Plain text nav items | Same — semantic stays |
| No "Labs" pill | Add `Labs` pill on the right with a small `--accent` dot |
| No avatar circle | Add 30×30 round avatar with user initials, `bg-pacific-500 text-white` |
| Brand: text only | Brand: `<img src="/icon-mark.svg" />` + wordmark, 9px gap |

The icon-mark SVG lives in this project at `assets/icon-mark.svg`; copy to
`web/public/icon-mark.svg`.

Active-state underline: 2px tall, sits 19px below the link, `bg-primary`,
2px border-radius. Reference: `Nav.jsx` line ~32, CSS in `styles.css` `.tb-nav__link.is-active::after`.

---

## 2. DigestBanner (highest impact)

**Source of truth:** `ui_kits/talent_brief/DigestBanner.jsx`
**Current code:** lives somewhere in `web/components/digests/` or `web/components/dashboard/`

### Changes

This is the most visible surface in the product. Three structural changes:

1. **Background.** Use `bg-[image:var(--gradient-coast)]` (or apply
   `style={{ background: "var(--gradient-coast)" }}` if cleaner). The current
   banner is a flat color; the gradient is what signals "weekly editorial moment."
2. **Headline.** Use the editorial display utility:
   `<h2 className="text-display text-[26px]">…</h2>`
   Specifically the headline copy lives at `font-display font-semibold text-[26px] tracking-[-0.012em] leading-[1.18] max-w-[720px]`.
3. **Eyebrow + meta.** Above the headline:
   `<div className="font-mono text-[11px] uppercase tracking-[0.08em] text-primary mb-[10px]">This week</div>`

Below the headline, the meta row uses `font-mono text-[11.5px] text-muted-foreground letter-spacing-0.02em`.

CTA: ghost button `border border-border bg-transparent hover:bg-bg-subtle`, NOT a primary fill — keeps the editorial moment intact.

---

## 3. StatCard

**Source of truth:** `ui_kits/talent_brief/StatCard.jsx`
**Current code:** `web/components/dashboard/StatCard.tsx` (or similar)

### Changes

| Property | Value |
|---|---|
| Background | `bg-card` (which now is white/elevated; sits on the new warm body bg) |
| Border | `border border-border` |
| Padding | `p-4 px-[18px]` (16px / 18px) |
| Radius | `rounded-[10px]` |
| Label | `text-xs font-medium text-muted-foreground` |
| Value | `text-[26px] font-bold tracking-[-0.02em] tabular-nums` |
| Pos value tint | `text-[oklch(0.50_0.13_155)]` — growth-green; never use the destructive token |
| Sparkline color | `stroke-primary` |
| Subtitle | `text-xs text-muted-foreground` |
| Hover (when linked) | `hover:bg-secondary hover:shadow-sm` |

Stat row container: `grid grid-cols-4 gap-[14px]` desktop, `grid-cols-2` ≤880px.

**Don't use Card from shadcn here.** The card chrome is too heavy. A simple
div with the styles above matches the preview card.

---

## 4. HotRoles

**Source of truth:** `ui_kits/talent_brief/HotRoles.jsx`
**Current code:** likely in `web/components/dashboard/`

### Changes

Each role row is a horizontal flex with:
- Tiny company avatar (22×22, `rounded-md`, color from company brand)
- Title (`font-medium`)
- "new" chip (`bg-accent-soft text-accent-soft-fg`) if posted in last 48h
- Function chip (`bg-muted text-foreground`)
- Location (muted)
- Posted age (mono, muted, tabular-nums)

The "new" pip uses our chip system — see `.tb-chip--accent` in `styles.css`.

---

## 5. StrategySignals

**Source of truth:** `ui_kits/talent_brief/StrategySignals.jsx`
**Current code:** likely in `web/components/dashboard/` or `web/components/digests/`

### Changes

Each signal row:
- Strength dot (7×7 circle, color depends on alignment — see `tb-strength--*` in styles.css)
- "kind" eyebrow (mono, uppercase, tracked)
- Body sentence (regular text)
- Optional alignment chip on the right

Color mapping:
- `strong` → `oklch(0.55 0.13 155)` (green)
- `moderate` → `var(--accent)` (sunset)
- `weak` → `var(--muted-foreground)` (gray)
- `contradicting` → `var(--highlight)` (sun)

This component is also used inside the digest reader and the company drill-down,
so make it reusable: `<StrategySignals signals={…} variant="card | inline" />`.

---

## 6. HiringChart

**Source of truth:** `ui_kits/talent_brief/HiringChart.jsx`
**Current code:** lives in `web/components/dashboard/` or charts dir.

### Changes

If the project uses Recharts:

```tsx
const chartColors = {
  primary:  "var(--chart-1)",   // Pacific 500
  faded:    "var(--chart-2)",   // Pacific 300
  warm:     "var(--chart-3)",   // Sunset 500
  highlight:"var(--chart-4)",   // Sun 500
  growth:   "var(--chart-5)",   // Growth green
};

<Bar dataKey="net" fill="var(--chart-1)" />
<Bar dataKey="closed" fill="var(--chart-2)" />
```

Tick labels: `fontFamily: "var(--font-mono)"`, `fontSize: 11`, `fill: "var(--muted-foreground)"`.

Y axis label: small caps mono, no axis line.

**Important:** never use the `destructive` token to indicate negative numbers
in hiring charts. Use `var(--chart-3)` (sunset) for negatives — it's a
*slowdown*, not an error.

---

## 7. CompanyMatrix

**Source of truth:** `ui_kits/talent_brief/CompanyMatrix.jsx`
**Current code:** likely on the dashboard or `/companies` page.

### Changes

The current implementation is a plain table. The redesign keeps the table but:

- Avatar column gets a `tb-table__avatar` 28×28 rounded square in company brand color.
- Status column uses chips: `tb-chip--pacific` (strategic), `tb-chip--neutral` (templates / paused).
- Net-7d uses `tb-net is-pos | is-neg` (green / sunset, mono, tabular-nums).
- Hover: `hover:bg-secondary cursor-pointer` and the whole row navigates to `/companies/[slug]`.

Reference styles: see `.tb-table--list` and friends in `ui_kits/talent_brief/styles.css`.

---

## Translation rules (for any component)

When porting a JSX file from this project to React/TSX in the codebase:

| In this project | In the codebase |
|---|---|
| `className="tb-card"` | Translate to Tailwind classes — see styles.css for the source rule, then write the equivalent. We deliberately don't ship `tb-*` classes to the codebase; the Tailwind tokens are the contract. |
| `var(--primary)` | `text-primary`, `bg-primary`, `border-primary`, etc. |
| `var(--pacific-500)` | `text-pacific-500`, `bg-pacific-500`, etc. |
| `var(--gradient-coast)` | inline `style={{ background: "var(--gradient-coast)" }}` — Tailwind v4 doesn't tokenize gradients yet. |
| `var(--font-display)` | `font-display` utility (added in globals.css) |
| `lucide-react` icon | Same — codebase already uses it. |
| Inline data arrays | Replace with real Supabase queries. The shape of the data should match — that's intentional. |

When the production component does something this project doesn't (e.g. real
async loading, error boundaries, supabase RLS), keep that logic. The design
system specifies *appearance*, not data flow.
