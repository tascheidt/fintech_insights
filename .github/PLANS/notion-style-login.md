# Notion-Style Login Implementation Plan

**Overall Progress:** `100%`

## TLDR
Redesign the authentication experience to mimic Notion's clean, minimal aesthetic. This involves replacing the current "landing page" style with a simplified layout featuring a top-right header with "Log in" and "Get started" buttons, and a cleaner, less noisy background.

## Critical Decisions
- **Unified Auth Flow:** Both "Log in" and "Get started" buttons will trigger the same existing Google OAuth flow (`signInWithOAuth`), as we only support Google Sign-In. The distinction is purely visual/UX.
- **Layout Strategy:** We will modify `web/app/(auth)/layout.tsx` to include the new header, ensuring it persists across the auth pages.
- **Styling Direction:** Moving away from the current "dark mode with glowing orbs" to a cleaner, more professional aesthetic (likely a clean white or very subtle off-white/light gray theme, or a refined dark theme if strictly required, but "Notion-style" usually implies clean, high-contrast typography). *Assumption: We will aim for a clean light/dark neutral theme that matches the dashboard's professionalism.*

## Tasks

- [x] 🟩 **Step 1: Layout & Header Implementation**
  - [x] 🟩 Create a new Header component for the auth layout (`web/components/auth/AuthHeader.tsx` or inline in layout).
  - [x] 🟩 Implement "Log in" (Ghost/Text variant) and "Get started" (Solid/Primary variant) buttons in the header.
  - [x] 🟩 Update `web/app/(auth)/layout.tsx` to include the header and remove the existing "glowing orbs" background effects, replacing them with a cleaner background.

- [x] 🟩 **Step 2: Login Page Redesign**
  - [x] 🟩 Refactor `web/app/(auth)/login/page.tsx` to remove the feature grid and heavy marketing copy.
  - [x] 🟩 Implement a simplified Hero section with a clear value proposition (e.g., "Your Fintech Intelligence Hub").
  - [x] 🟩 Add a central "Continue with Google" action or ensure the header buttons are the primary call to action. (Notion often has a simple email input or "Continue with..." on the main page too).
  - [x] 🟩 Ensure error states (OAuth errors) are still displayed gracefully in the new layout.

- [x] 🟩 **Step 3: Styling & Polish**
  - [x] 🟩 Apply "Notion-like" typography and spacing (clean sans-serif, generous whitespace).
  - [x] 🟩 Verify responsiveness (header adaptation on mobile).
  - [x] 🟩 Ensure the "Get started" button stands out effectively.
