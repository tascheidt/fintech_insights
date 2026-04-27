/**
 * EMAIL_COLORS — centralized hex palette for email templates.
 *
 * Email clients can't consume CSS variables. Hex strings derived from the
 * canonical SoCal oklch tokens in `web/app/globals.css`. To change the
 * email palette, edit this file (and re-derive from globals.css if a token
 * changes upstream).
 *
 * Used by: lib/email/templates/*, packages/feedback/(src|templates)/.
 */
export const EMAIL_COLORS = {
  // Surfaces (warm sand neutrals)
  bg:           "#fbf9f4",  // sand-25 — outer email background
  surface:      "#ffffff",  // sand-0  — card surface
  surfaceMuted: "#f4efe5",  // sand-100 — divider / hover bg

  // Text (warm near-black ramp)
  fg:           "#1c1916",  // sand-950 — primary text
  fg1:          "#2a2620",  // sand-900 — secondary
  fg2:          "#564e44",  // sand-700 — body
  fgMuted:      "#8b8175",  // sand-500 — caption / meta
  fgFaint:      "#b1a89a",  // sand-400 — disabled

  // Borders
  border:       "#e6dfd1",  // sand-200
  borderSubtle: "#f0eadc",  // sand-100 alt

  // Brand — Pacific
  primary:      "#1d6cb1",  // pacific-500
  primaryHover: "#155794",  // pacific-600
  primarySoft:  "#e6f0f8",  // pacific-50
  primarySoftFg:"#0e3f6f",  // pacific-700

  // Sun (accent — warm CTAs)
  accent:       "#d6b439",  // sun-500-ish, slightly darker for legibility on bg
  accentSoft:   "#fbf3d4",  // sun-100
  accentSoftFg: "#7a5a0e",  // sun-800

  // Sunset (highlight — change markers, alerts)
  highlight:    "#d76b3a",  // sunset-500
  highlightSoft:"#fce6d7",  // sunset-100
  highlightSoftFg:"#a8421c",// sunset-700

  // Semantic
  danger:       "#c63f1c",  // destructive (true error states only)
  dangerSoft:   "#fde4dc",
  dangerSoftFg: "#7a1f0a",
} as const;

export type EmailColor = keyof typeof EMAIL_COLORS;
