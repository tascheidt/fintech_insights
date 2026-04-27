# MIGRATION.md — Ship order

> **Read `README.md` first.** The core principle is *everything is a token, no
> raw values in components, ever*. This migration is the mechanical work of
> getting there. If a step here ever seems to ask you to hardcode a hex or
> reproduce a value: stop, add a token to `globals.css`, and reference it.

Apply the changes in this order. Each step is independently shippable, runs in
isolation, and produces a visible improvement. Do not skip ahead — step 2
depends on step 1, etc.

After each step, screenshot the relevant route and pin it next to the matching
preview card in this design-system project.

---

## Phase 1 — Foundation (0.5 day)

**Goal:** every screen in the app shifts from grayscale to the SoCal palette in
a single PR. Visual delta is large but mechanical. No component logic changes.

| # | Action | File |
|---|---|---|
| 1.1 | Drop in new tokens | replace `web/app/globals.css` with `handoff/globals.css` |
| 1.2 | Add Fraunces | apply `handoff/layout.tsx.diff` to `web/app/layout.tsx` |
| 1.3 | (Only if needed) Add Tailwind config | place `handoff/tailwind.config.ts` at `web/tailwind.config.ts` |

**Verification:** load the dashboard. The "Hot roles this week" chips, sparklines,
nav-active underline, and stat-card values should now be Pacific blue (`oklch(0.56 0.13 207)`),
not grayscale. The body background should be a warm off-white (`--sand-50`), not pure white.
The dark-mode toggle still works.

**Add now, before phase 2:** the lint rule from `lint-rule-no-raw-color.md`.
This stops new drift the moment the new tokens land.

---

## Phase 2 — Existing component diffs (1.5 days)

**Goal:** structural fixes to the components that already exist in the
codebase, so they match the approved preview cards. See `COMPONENT_DIFFS.md`
for per-component instructions.

Order within phase 2:

1. **Layout & Nav** — `web/components/layout/DashboardNav.tsx` first; it sets
   the visual tone for everything else.
2. **DigestBanner** — single highest-impact surface. Uses `--gradient-coast`,
   visible above the fold on the dashboard.
3. **StatCard** — appears in 4+ places. Easy to ship, big "feel" delta.
4. **HotRoles, StrategySignals, HiringChart, CompanyMatrix** — dashboard
   widgets. Order doesn't matter; ship as one PR or split.

Each component should land in a separate PR with a before/after screenshot.

---

## Phase 3 — New routes (4–5 days)

**Goal:** ship the seven surfaces that don't exist in code yet. See
`NEW_ROUTES.md` for the route file paths and source-of-truth JSX files.

Recommended ship order — earliest-feedback first:

1. **`/login`** (path already exists; it's a redesign, not a new route).
2. **`/companies/[slug]`** — page already exists at 17K bytes. Treat as a
   redesign + new sections (hiring evolution, signals timeline, interpretation).
3. **`/jobs/[id]`** — page exists at 4K bytes. Mostly an additive redesign:
   add inline signal tags + sidebar.
4. **`/digests/archive`** — new route under existing `digests/` group.
5. **`/settings`** — page exists; the redesign reorganizes into tabs
   (Notifications / Sources / Account / Team).
6. **`/(marketing)`** — new logged-out route group.
7. **Empty states** — drop into existing pages, replace whatever placeholder
   is there.

Each new route can be shipped behind a feature flag or directly to production.
The new tokens from phase 1 mean even partially-redesigned routes look
consistent.

---

## Phase 4 — Polish (0.5 day)

- Add the empty-state components from `EmptyStates.jsx` as reusable React
  components in `web/components/feedback/EmptyState.tsx`.
- Wire empty states into Companies (`/companies` when empty), Jobs (`/jobs`
  when filtered to nothing), Digest archive (week 1), Settings sources.
- Write a short `web/components/README.md` pointing at the design system project
  as the source of truth for any new visual changes.

---

## Verification checklist (run after every phase)

- [ ] No raw hex codes outside `globals.css` (lint rule catches this).
- [ ] No grayscale OKLCH values like `oklch(0.205 0 0)` outside `globals.css`.
- [ ] Storybook (or a stories folder) renders each shared component.
- [ ] Lighthouse contrast still ≥ AA on every text + interactive element.
- [ ] Dark mode (`<html class="dark">`) renders without obvious regressions.
- [ ] The Fraunces serif appears ONLY on: digest hero, marketing hero, login
      hero, the company stated-strategy callout. Nowhere else.

---

## Rollback

- Phase 1 is one CSS file — `git revert` the commit if anything explodes.
- Phase 2/3 PRs are independently revertable; leave the tokens in place.
- The lint rule can be downgraded to `warn` mid-migration if CI gets noisy.

---

## Working with Claude Code on this migration

When you hand this folder to Claude Code, point it at:

1. `handoff/README.md` first — sets the frame.
2. `handoff/MIGRATION.md` — the order.
3. `colors_and_type.css` (this project's root) — when in doubt about a token.
4. `ui_kits/talent_brief/*.jsx` — when in doubt about a component's structure.

Tell it: *"Use the design system in this project as the source of truth.
Apply phase 1 first, open a PR, and stop. Don't touch components until phase
1 is merged."*
