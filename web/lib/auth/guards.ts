/**
 * Centralized auth guards for API route handlers.
 *
 * `proxy.ts` skips `/api/**`, so each API route is responsible for its own
 * auth. These guards make the intent explicit and enforce a single canonical
 * pattern (no per-route ad-hoc auth checks).
 *
 * Routing policy (see `web/lib/auth/CLAUDE.md`):
 *   - /api/cron/**       -> requireCronSecret(req)
 *   - /api/internal/**   -> requireCronSecret(req)
 *   - /api/admin/**      -> requireAdmin()
 *   - everything else    -> requireUser()
 *   - /api/feedback POST -> anonymous-OK (handled inside @tascheidt/feedback)
 *
 * Convention: each guard returns either the resolved value or a `NextResponse`
 * (401 / 403) — callers do `if (auth instanceof NextResponse) return auth;`.
 */

import "server-only";

import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";

export interface AuthedUser {
  user: User;
  supabase: SupabaseClient;
}

export interface AuthedAdmin extends AuthedUser {
  role: "admin";
}

const UNAUTHORIZED = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const FORBIDDEN = (message = "Admin access required") =>
  NextResponse.json({ error: message }, { status: 403 });

/**
 * Require an authenticated Supabase user. Returns either the resolved
 * `{ user, supabase }` pair or a 401 `NextResponse` to forward.
 */
export async function requireUser(): Promise<AuthedUser | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return UNAUTHORIZED();
  return { user, supabase };
}

/**
 * Require an authenticated user whose `profiles.role === 'admin'`. Returns
 * either `{ user, supabase, role: 'admin' }` or a 401/403 `NextResponse`.
 *
 * Mirrors the same logic the feedback package uses
 * (`web/packages/feedback/src/auth-defaults.ts`) — kept in sync intentionally.
 */
export async function requireAdmin(): Promise<AuthedAdmin | NextResponse> {
  const result = await requireUser();
  if (result instanceof NextResponse) return result;

  const { user, supabase } = result;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return FORBIDDEN();

  return { user, supabase, role: "admin" };
}

/**
 * Require an `Authorization: Bearer ${CRON_SECRET}` header. Returns `null` on
 * success, or a 401 `NextResponse` to forward.
 *
 * Used by `/api/cron/**` and `/api/internal/**`. Vercel Cron sends this header
 * automatically when `CRON_SECRET` is set in project settings; internal
 * fan-out routes call themselves with the same header to chain invocations.
 */
export function requireCronSecret(req: NextRequest): NextResponse | null {
  const auth =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    log.error(
      { path: req.nextUrl.pathname },
      "CRON_SECRET is not configured — refusing cron auth"
    );
    return NextResponse.json(
      { error: "Server misconfigured: CRON_SECRET not set" },
      { status: 500 }
    );
  }

  if (auth !== `Bearer ${cronSecret}`) {
    log.warn(
      {
        path: req.nextUrl.pathname,
        hasAuthHeader: Boolean(auth),
      },
      "Cron auth rejected"
    );
    return UNAUTHORIZED();
  }

  return null;
}
