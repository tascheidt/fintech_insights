# Feature Implementation Plan: Remove Welcome Message

**Overall Progress:** `100%`

## TLDR
Remove the personalized "Welcome back, [Name]" banner from the main dashboard to reduce clutter and free screen real estate. The dashboard will go straight to stats and content.

## Critical Decisions
- **Remove user/profile fetches on dashboard** — `getUser()` and the `profiles` query exist only to supply `WelcomeMessage`. Both can be removed; no other dashboard UI uses them.
- **Delete `WelcomeMessage` component** — It is used only in `web/app/(dashboard)/page.tsx`. Safe to remove the component file after dropping usage.

## Tasks

- [x] 🟩 **Step 1: Remove WelcomeMessage from dashboard**
  - [x] 🟩 Remove `<WelcomeMessage />` and its JSX block from `web/app/(dashboard)/page.tsx`
  - [x] 🟩 Remove the `WelcomeMessage` import

- [x] 🟩 **Step 2: Remove profile/user data fetching**
  - [x] 🟩 Remove `supabase.auth.getUser()` and the `user` variable
  - [x] 🟩 Remove the `profiles` query and `profile` variable (only used by WelcomeMessage)
  - [x] 🟩 Update the file header comment to drop "Personalized welcome message" from the features list

- [x] 🟩 **Step 3: Delete WelcomeMessage component**
  - [x] 🟩 Delete `web/components/dashboard/WelcomeMessage.tsx`
