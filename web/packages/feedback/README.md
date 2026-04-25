# @tascheidt/feedback

Reusable feedback submission, admin triage, and GitHub issue pipeline for Next.js + Supabase apps.

## What's included

| Layer | Description |
|-------|-------------|
| **Route handler factories** | `createFeedbackHandlers`, `createAdminFeedbackHandlers`, `createCodeGenHandler` — wire into your Next.js API routes |
| **Services** | GitHub issue creation, email notifications, Zod validation |
| **Types** | `FeedbackConfig`, `FeedbackItem`, `FeedbackSubmission`, etc. |
| **SQL migration** | Ready-to-run DDL for `feedback_submissions` table |
| **UI templates** | Copy-paste React components (adapt to your design system) |

## Quick start

### 1. Install

```bash
# From your Next.js app directory
npm install @tascheidt/feedback
# or link locally:
# Add to package.json: "@tascheidt/feedback": "file:../packages/feedback"
```

### 2. Run the migration

Copy `migration/001_feedback_submissions.sql` into your Supabase migrations or run it directly in the SQL editor. Adjust the `REFERENCES profiles(id)` clauses if your user table has a different name.

### 3. Create your config

```typescript
// lib/feedback-config.ts
import type { FeedbackConfig } from "@tascheidt/feedback";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const feedbackConfig: FeedbackConfig = {
  appName: "My App",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  createServerClient: () => createClient(),
  createAdminClient: () => createAdminClient(),

  // Optional: GitHub integration
  github: {
    token: process.env.GJ_GITHUB_TOKEN!,
    owner: process.env.GJ_GITHUB_OWNER!,
    repo: process.env.GJ_GITHUB_REPO!,
  },

  // Optional: Email notifications
  email: {
    resendApiKey: process.env.RESEND_API_KEY!,
    fromAddress: process.env.RESEND_FROM || "noreply@example.com",
  },
};
```

### 4. Wire up API routes

Create three thin route files:

```typescript
// app/api/feedback/route.ts
import { createFeedbackHandlers } from "@tascheidt/feedback/server";
import { feedbackConfig } from "@/lib/feedback-config";

export const { POST, GET } = createFeedbackHandlers(feedbackConfig);
```

```typescript
// app/api/admin/feedback/route.ts
import { createAdminFeedbackHandlers } from "@tascheidt/feedback/server";
import { feedbackConfig } from "@/lib/feedback-config";

export const { GET, PATCH } = createAdminFeedbackHandlers(feedbackConfig);
```

```typescript
// app/api/admin/feedback/[id]/generate-code/route.ts
import { createCodeGenHandler } from "@tascheidt/feedback/server";
import { feedbackConfig } from "@/lib/feedback-config";

export const { POST } = createCodeGenHandler(feedbackConfig);
```

### 5. Add UI components

Copy the templates from `templates/components/` into your app's components directory. Customize:

- **UI imports**: Replace `@/components/ui/*` with your app's component library
- **API_PATH / ADMIN_API_PATH**: Must match your config's `apiBasePath` / `adminApiBasePath`
- **APP_NAME**: Your application name

Required shadcn/ui components (if using shadcn): `dialog`, `button`, `input`, `textarea`, `select`, `card`

## Configuration reference

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `appName` | Yes | — | App name for emails and UI |
| `appUrl` | Yes | — | App URL for email links |
| `createServerClient` | Yes | — | Factory for Supabase client with user session |
| `createAdminClient` | Yes | — | Factory for Supabase admin client (bypasses RLS) |
| `feedbackTypes` | No | feature/bug/improvement/general | Customize feedback categories |
| `apiBasePath` | No | `/api/feedback` | User feedback API path |
| `adminApiBasePath` | No | `/api/admin/feedback` | Admin feedback API path |
| `getUser` | No | `supabase.auth.getUser()` | Custom user resolver |
| `isAdmin` | No | `profiles.role === "admin"` | Custom admin checker |
| `userTable` | No | `"profiles"` | Name of your user/profiles table |
| `userEmailColumn` | No | `"email"` | Column containing user emails |
| `userRoleColumn` | No | `"role"` | Column containing user roles |
| `userForeignKey` | No | `"feedback_submissions_user_id_fkey"` | FK constraint name |
| `adminRoleValue` | No | `"admin"` | Value that identifies admins |
| `github` | No | — | `{ token, owner, repo, codeGenWorkflowFile? }` |
| `email` | No | — | `{ resendApiKey, fromAddress, adminPanelPath? }` |

## Environment variables

```bash
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# GitHub (optional — enables auto issue creation)
GJ_GITHUB_TOKEN=
GJ_GITHUB_OWNER=
GJ_GITHUB_REPO=

# Email (optional — enables admin notifications)
RESEND_API_KEY=
RESEND_FROM=
NEXT_PUBLIC_APP_URL=
```

## Feedback flow

1. **User submits** feedback via the dialog component -> `POST /api/feedback`
2. **Email notification** sent to all admin users (if email configured)
3. **AI triage** runs asynchronously (external Edge Function, not included)
4. **Admin reviews** in the review table -> `PATCH /api/admin/feedback`
5. **GitHub issue** auto-created when admin accepts (if GitHub configured)
6. **Code generation** triggered via GitHub Actions workflow (if configured)
