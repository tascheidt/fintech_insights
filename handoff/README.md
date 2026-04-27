# Talent Brief — Developer Handoff Package

This folder is the bridge between the design system in this project and the
production codebase at `tascheidt/fintech_insights` (`web/`).

It is **not source code**. It is a sequence of specific, copy-pastable edits an
engineer (or Claude Code) can apply to ship the design system. Every file in
this package corresponds to a real file in `web/` — the suffix tells you what
kind of change to make.

---

## ⚑ Core principle: everything is a token

**The single most important rule in this handoff: every visual value in the
codebase — every color, font, radius, shadow, spacing scale, gradient — must
reference a design token. No raw values in components, ever.**

A design token is a named CSS variable (`var(--primary)`, `var(--pacific-500)`,
`var(--font-display)`, `var(--shadow-sm)`) defined once in `web/app/globals.css`
and consumed everywhere else. This is the whole point of the system:

- **Consistency.** When two engineers reach for "the brand blue," they both get
  `bg-primary` — there is no other option, so they can't drift apart.
- **One-line global changes.** Tweaking `--primary` from Pacific 500 to
  Pacific 600 updates 200+ usages instantly. Tweaking a hex code updates one.
- **Themability.** Light/dark mode is just two `:root` blocks; nothing in
  components has to know.
- **Reviewable.** A PR that adds `bg-pacific-500` is obviously on-system.
  A PR with `bg-[#0ea5e9]` is obviously off-system, even to a non-designer.

### What this looks like in practice

```tsx
// ❌ Wrong — raw values; drift starts here
<div style={{ background: "#0ea5e9", color: "white", borderRadius: "10px" }}>
<button className="bg-[#1d4ed8] text-white">

// ❌ Wrong — even a "matching" hex code; the system can't see it
<span style={{ color: "oklch(0.56 0.13 207)" }}>

// ✅ Right — Tailwind token (preferred)
<div className="bg-primary text-primary-foreground rounded-lg">
<button className="bg-pacific-700 text-white">
<span className="text-primary">

// ✅ Right — CSS variable for cases Tailwind can't reach (gradients, inline)
<div style={{ background: "var(--gradient-coast)" }}>
```

### How we enforce it

Three layers, all shipped in this package:

1. **`globals.css`** — defines every token. The only file in the codebase
   permitted to contain raw OKLCH values.
2. **Tailwind v4 `@theme inline`** — exposes the tokens as utility classes
   (`bg-primary`, `text-pacific-500`, `font-display`) so engineers reach for
   them by reflex.
3. **`lint-rule-no-raw-color.md`** — ESLint rule that fails CI on any raw
   hex / rgb / oklch literal outside `globals.css`. Add it before phase 2.

If an engineer needs a color that doesn't exist in the token system, the answer
is **add a token, don't hardcode a hex**. Updating tokens is the cheap path;
hardcoding hexes is the expensive one.

---

## What's in this folder

```
handoff/
├── README.md                 ← you are here
├── MIGRATION.md              ← the order to ship things in (read this second)
├── globals.css               ← drop-in replacement for web/app/globals.css
├── tailwind.config.ts        ← extend Tailwind theme with named scales
├── layout.tsx.diff           ← add Fraunces to web/app/layout.tsx
├── COMPONENT_DIFFS.md        ← per-component changes for existing screens
├── NEW_ROUTES.md             ← screens that don't exist in code yet
└── lint-rule-no-raw-color.md ← drift prevention
```

## Source of truth

- **Design tokens:** `colors_and_type.css` (this project, project root).
  All colors, fonts, shadows, gradients live here. The `handoff/globals.css`
  in this folder is the same tokens, restructured for the existing Tailwind v4
  `@theme inline` layout in `web/app/globals.css`.
- **Component reference:** `ui_kits/talent_brief/*.jsx` (this project).
  Each JSX file is a working reference implementation. Translation rules to
  the production stack are in `COMPONENT_DIFFS.md`.
- **Visual review:** the Design System tab in this project. Every preview card
  has a `status` of `approved` / `needs-review` / `changes-requested`. Don't
  ship anything still in `changes-requested`.

## How to use this package

1. Read `MIGRATION.md`.
2. Apply changes in the order it specifies. Each step is independently shippable.
3. After each step, screenshot the live route and compare against the matching
   preview card in this project.
4. Add the lint rule from `lint-rule-no-raw-color.md` after step 1 lands so
   nobody silently re-introduces hex codes.

## Estimated effort

| Phase | What | Effort |
|---|---|---|
| 1 | Tokens + fonts (globals.css, tailwind.config.ts, layout.tsx) | 0.5 day |
| 2 | Existing components diff (Nav, StatCard, DigestBanner, …) | 1.5 days |
| 3 | New routes (login, marketing, company drill-down, etc.) | 4–5 days |
| 4 | Empty states + lint rule | 0.5 day |

Total: ~1 week of focused work for one engineer.
