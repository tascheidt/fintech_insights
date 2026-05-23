/**
 * One-off Phase 3 seed: insert the 4 new incumbent bank rows into the
 * `companies` table. The Supabase MCP is currently disconnected, so this
 * script is the substitute path that runs locally with the service-role
 * key in .env.local.
 *
 * Usage (from `web/`):
 *   npx tsx --env-file=.env.local scripts/seed-phase3-banks.ts
 *
 * Idempotent: each row uses `upsert(..., { onConflict: '...' })` so
 * re-runs are safe. is_active stays false on first insert — flip it after
 * smoke + 24h of clean job_runs entries.
 *
 * NOTE: There is intentionally NO `simplii` row in this seed. Phase 3
 * ships the Simplii classifier in LOG-ONLY mode (see workday-cibc.ts).
 * Once production logs confirm Simplii postings actually surface inside
 * CIBC's Workday tenant, a follow-up adds the row + flips the classifier
 * to route via `companySlugOverride`.
 */

import { createAdminClient } from "@/lib/supabase/admin";

interface IncumbentBankSeed {
  name: string;
  slug: string;
  country: string;
  ats_type: string;
  ats_identifier: string;
  careers_url: string;
}

const BANKS: IncumbentBankSeed[] = [
  {
    name: "BMO",
    slug: "bmo",
    country: "CA",
    ats_type: "phenom",
    ats_identifier: "bmo",
    careers_url: "https://jobs.bmo.com/ca/en/search-results",
  },
  {
    name: "TD",
    slug: "td",
    country: "CA",
    ats_type: "workday-td",
    ats_identifier: "td",
    careers_url:
      "https://td.wd3.myworkdayjobs.com/en-US/TD_Bank_Careers",
  },
  {
    name: "CIBC",
    slug: "cibc",
    country: "CA",
    ats_type: "workday-cibc",
    ats_identifier: "cibc",
    careers_url: "https://cibc.wd3.myworkdayjobs.com/search",
  },
  {
    name: "National Bank",
    slug: "bnc",
    country: "CA",
    ats_type: "phenom",
    ats_identifier: "bnc",
    careers_url: "https://emplois.bnc.ca/fr_CA/careers/searchjobs",
  },
];

async function main(): Promise<void> {
  const supabase = createAdminClient();

  // The companies table is org-scoped. Use the same default org RBC uses.
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", "default")
    .single();
  if (orgErr || !org) {
    throw new Error(
      `[seed-phase3] default organization not found: ${orgErr?.message ?? "no row"}`
    );
  }

  for (const bank of BANKS) {
    const row = {
      organization_id: org.id,
      name: bank.name,
      slug: bank.slug,
      country: bank.country,
      ats_type: bank.ats_type,
      ats_identifier: bank.ats_identifier,
      careers_url: bank.careers_url,
      is_active: false,
      tier: "incumbent" as const,
    };

    const { error: upsertErr } = await supabase
      .from("companies")
      .upsert(row, { onConflict: "organization_id,slug" });
    if (upsertErr) {
      throw new Error(
        `[seed-phase3] upsert failed for ${bank.slug}: ${upsertErr.message}`
      );
    }
    console.log(`[seed-phase3] upserted ${bank.slug} (${bank.name})`);
  }

  // Tier-integrity assert (Luke's blocker #7). If any of the 4 came back
  // with the default 'fintech' tier — e.g. an older row already existed
  // with that value and upsert didn't overwrite it — fail loudly. A bank
  // silently in the fintech tier would leak straight into every aggregator
  // the Phase 0/Step-1 work was supposed to protect.
  const { data: verify, error: verifyErr } = await supabase
    .from("companies")
    .select("slug, tier, is_active, ats_type")
    .in(
      "slug",
      BANKS.map((b) => b.slug)
    );
  if (verifyErr || !verify) {
    throw new Error(
      `[seed-phase3] verification query failed: ${verifyErr?.message ?? "no rows"}`
    );
  }
  const mis = verify.filter((r) => r.tier !== "incumbent");
  if (mis.length > 0) {
    throw new Error(
      `[seed-phase3] tier integrity violated — these rows are not 'incumbent': ${mis
        .map((r) => `${r.slug}=${r.tier}`)
        .join(", ")}`
    );
  }
  console.log(`[seed-phase3] tier integrity ok — 4/4 rows confirmed 'incumbent'`);
  console.log(`[seed-phase3] all is_active=false; flip after smoke.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
