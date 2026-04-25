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
