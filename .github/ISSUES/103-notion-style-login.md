# 103 – Notion-style login page and auth layout

## TL;DR

Redesign the login/landing page to feel like Notion: cleaner, more minimal styling and a top-right header with **Log in** and **Get started** (or **Sign up**) buttons instead of a single centered sign-in card.

## Current vs expected

| Current | Expected |
|--------|----------|
| Full landing: hero, feature grid, sign-in card. No global header. | Notion-like layout: header with Log in + Get started in top right; simplified hero/messaging below. |
| Dark gradient background (slate/blue/violet), orbs, grid overlay. | Notion-inspired aesthetic: cleaner, lighter or more refined dark theme, less visual noise. |
| Single “Continue with Google” CTA in a card. | Two header CTAs (Log in, Get started) like [Notion](https://www.notion.com/); both can trigger Google OAuth. |

## Relevant files

- `web/app/(auth)/login/page.tsx` – Landing + sign-in UI; adjust layout, copy, and CTAs.
- `web/app/(auth)/layout.tsx` – Add top-right header (Log in, Get started); update background/styling to match Notion-like look.
- `web/proxy.ts` – Redirect logic unchanged; still sends unauthenticated users to `/login`.

## Notes

- Auth is Google OAuth only. “Log in” and “Get started” can both open the same flow; difference is placement and labeling (Notion-style).
- Keep OAuth flow, callback, and error handling as-is; focus on layout and styling.
- Consider responsive behavior for the header (e.g. collapsed menu on small screens).

## Labels

- **Type:** improvement
- **Priority:** normal
- **Effort:** medium
