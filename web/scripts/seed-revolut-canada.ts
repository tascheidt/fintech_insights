/**
 * One-off seed: insert the Revolut Canada company row into the `companies`
 * table. Revolut runs a custom-built Next.js careers SPA behind Cloudflare
 * — the dedicated `web/lib/scrapers/revolut.ts` scraper handles it (the
 * generic Puppeteer fallback drops every job because Revolut URLs are
 * slug+UUID, not `/jobs/\d+`). Offloaded to GitHub Actions via
 * `isBrowserScraper`.
 *
 * Usage (from `web/`):
 *   npx tsx --env-file=.env.local scripts/seed-revolut-canada.ts
 *
 * Idempotent: uses upsert on (organization_id, slug) so re-runs are safe.
 * Starts with is_active=false — flip after a successful test scrape.
 */

import { createAdminClient } from "@/lib/supabase/admin";

async function main(): Promise<void> {
  const supabase = createAdminClient();

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", "default")
    .single();
  if (orgErr || !org) {
    throw new Error(
      `[seed-revolut-canada] default organization not found: ${orgErr?.message ?? "no row"}`
    );
  }

  const row = {
    organization_id: org.id,
    name: "Revolut Canada",
    slug: "revolut-canada",
    country: "CA",
    ats_type: "revolut",
    ats_identifier: "revolut",
    careers_url: "https://www.revolut.com/en-US/careers/?city=Canada",
    is_active: false,
    tier: "fintech" as const,
  };

  const { error: upsertErr } = await supabase
    .from("companies")
    .upsert(row, { onConflict: "organization_id,slug" });
  if (upsertErr) {
    throw new Error(
      `[seed-revolut-canada] upsert failed: ${upsertErr.message}`
    );
  }

  console.log(`[seed-revolut-canada] upserted revolut-canada (Revolut Canada)`);

  const { data: verify, error: verifyErr } = await supabase
    .from("companies")
    .select("slug, tier, is_active, ats_type, careers_url")
    .eq("slug", "revolut-canada")
    .single();
  if (verifyErr || !verify) {
    throw new Error(
      `[seed-revolut-canada] verification failed: ${verifyErr?.message ?? "no row"}`
    );
  }

  console.log(`[seed-revolut-canada] verified:`, verify);
  console.log(`[seed-revolut-canada] is_active=false; flip after test scrape.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
