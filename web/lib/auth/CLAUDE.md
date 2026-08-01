# `lib/auth/` — API auth guards

`web/proxy.ts` deliberately skips `/api/**`. Every API route is responsible
for its own auth. **Always use a guard from `guards.ts`.** Do not roll your
own `supabase.auth.getUser()` checks in route handlers.

## Guards

- **`requireUser()`** — fetches the current Supabase user. Returns
  `{ user, supabase }` or a 401 `NextResponse`.
- **`requireAdmin()`** — `requireUser()` + checks `profiles.role === 'admin'`.
  Returns `{ user, supabase, role: 'admin' }` or a 401/403 `NextResponse`.
- **`requireCronSecret(req)`** — checks
  `Authorization: Bearer ${CRON_SECRET}`. Returns `null` on success or a 401
  `NextResponse`.

`requireAdminApi()` in `lib/auth/admin.ts` is the legacy form of the same
check; new code should use `requireAdmin()` from `guards.ts`.

## Calling pattern

```ts
import { requireUser } from "@/lib/auth/guards";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  // ...
}
```

For `requireCronSecret` (no async work, no user object):

```ts
const denied = requireCronSecret(req);
if (denied) return denied;
```

## Route-auth policy

| Route prefix              | Guard                  | Notes                                                          |
| ------------------------- | ---------------------- | -------------------------------------------------------------- |
| `/api/cron/**`            | `requireCronSecret`    | Vercel Cron sends the bearer token automatically.              |
| `/api/internal/**`        | `requireCronSecret`    | Same secret; used by self-chaining fan-out routes.             |
| `/api/admin/**`           | `requireAdmin`         | Requires `profiles.role === 'admin'`. Exception: `/api/admin/cost-alarm` is `requireCronSecret`-gated (called by GH Actions; no user session). |
| `/api/feedback/route.ts`  | (handled in package)   | Any signed-in user; admin not required. Auth lives inside `@tascheidt/feedback`. |
| Everything else           | `requireUser`          | Default: any signed-in user.                                   |

Anonymous routes are not allowed — if you genuinely need an unauthenticated
public endpoint, document the exception in the route file and add rate
limiting (see Stream P1 — `/api/feedback` rate limit).

`/api/reports/**` is `requireUser` like everything else, with one extra rule:
the three routes are **owner-scoped**, and because the store uses the
service-role client (which bypasses RLS) the ownership check is written into
each query (`created_by = user.id`) rather than delegated. A non-owner gets a
404, not a 403, so ids aren't probeable.

## Public pages (not routes)

`proxy.ts` gates every *page* except `PUBLIC_PATHS` (exact matches) and
`PUBLIC_PREFIXES` (prefix matches — currently just `/r/`, the shared search
report at `app/(public)/r/[token]`).

A prefix there is a hole in the auth boundary. Adding one requires both:

1. **The capability is in the URL** — an unguessable, server-minted token, not
   a guessable id.
2. **The page issues no live queries** — it renders a stored snapshot only, so
   there is nothing an anonymous visitor can widen, enumerate, or filter-bypass.

Public reads use the service role behind an exact token match; the backing
table keeps owner-scoped RLS with **no `anon` policy**. Capability URLs must
set `robots: { index: false, follow: false }`. See
[`docs/SHARED_REPORTS.md`](../../../docs/SHARED_REPORTS.md).

## Email + password auth (in addition to Google OAuth)

Two client hooks back all browser-side auth:

- **`useGoogleAuth()`** (`web/hooks/use-google-auth.ts`) — `signInWithOAuth({ provider: "google" })`.
- **`useEmailAuth()`** (`web/hooks/use-email-auth.ts`) — wraps `signUp`,
  `signInWithPassword`, `resetPasswordForEmail`, and `updateUser({ password })`.

All flows land at `/auth/callback`, which calls `exchangeCodeForSession(code)` —
provider-agnostic, so the same handler works for OAuth, email confirmation
links, and password-reset links. The `auth_next` cookie (set on the client
before any redirect) survives the email round-trip and tells the callback
where to send the user.

Confirmation and reset emails are sent by **Supabase's built-in email
service**. To upgrade deliverability/rate limits, configure Resend SMTP in the
Supabase Console → Auth → SMTP Settings — no app code changes required.

Zod validation schemas live in `web/lib/auth/validation.ts`. Forms are plain
controlled components (no react-hook-form) — keep it that way unless we add a
materially more complex form.

Public unauthenticated routes are gated in `web/proxy.ts` via the
`PUBLIC_PATHS` set: `/login`, `/forgot-password`, `/account/update-password`.
Add any new unauthenticated page to that set, not by widening the negative
check.
