import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Single source of truth for the incumbent-tracking feature flag.
 *
 * Incumbent (big-bank) tracking — scraping, AI processing, and every UI
 * surface for `companies.tier = 'incumbent'` — is gated behind one
 * `system_settings` row. Default is OFF: we reverted to fintech-only to
 * control scrape volume and Gemini cost. An admin re-enables it from the
 * Admin → Settings tab; no incumbent code or data is deleted, so flipping
 * the flag back on restores everything.
 *
 * The flag lives in `system_settings`, NOT on `companies` — it must never be
 * conflated with `companies.is_active` (those two axes are kept independent;
 * see root CLAUDE.md §7). Reading `system_settings` here also keeps this file
 * out of the `design-system/active-company-scope` lint rule's scope.
 */

const SETTING_KEY = "incumbent_tracking_enabled";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Returns `true` only when the flag row is explicitly `{"enabled": true}`.
 *
 * Safe default: a missing row, a read error, or a malformed value all resolve
 * to `false`. The OFF state therefore holds even before the seed migration is
 * applied (migrations are applied manually, not auto by Vercel).
 *
 * Always reads via the service-role admin client so the result is independent
 * of the caller's RLS context (a normal signed-in user's cookie client cannot
 * see `system_settings`, which would otherwise read as OFF for everyone). The
 * flag value is not user-secret, so a service-role read in a server component
 * is fine. Cron routes and scripts pass in their existing admin client.
 */
export async function getIncumbentTrackingEnabled(
  client?: AdminClient
): Promise<boolean> {
  try {
    const supabase = client ?? createAdminClient();
    const { data, error } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", SETTING_KEY)
      .maybeSingle();

    if (error || !data) return false;

    const value = data.setting_value as { enabled?: unknown } | null;
    return value?.enabled === true;
  } catch {
    return false;
  }
}

/**
 * Server-component variant: React `cache()` dedups the read within a single
 * render pass (several incumbent-aware pages call it). Deliberately NOT a
 * module-level memo — that would serve a stale value across requests in a warm
 * serverless instance, so an admin's flip would not take effect until cold start.
 */
export const getIncumbentTrackingEnabledCached = cache(
  (): Promise<boolean> => getIncumbentTrackingEnabled()
);
