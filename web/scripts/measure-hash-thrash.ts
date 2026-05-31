#!/usr/bin/env npx tsx
/**
 * measure-hash-thrash.ts — quantify description_hash thrash (READ-ONLY).
 *
 * The 2026-05 cost audit found ~88% of daily Gemini extractions were re-runs of
 * EXISTING jobs whose scraped `description_text` churned the raw SHA-1 even when
 * the substance was unchanged (volatile boilerplate: posting dates, applicant
 * counts, requisition IDs, whitespace). `normalizeDescriptionForHash` (in
 * `lib/jobs/processor.ts`) fingerprints the stable content instead.
 *
 * This script proves the win: it re-scrapes a company live and, per job,
 * compares the RAW-hash flip rate (today's re-extraction trigger) against the
 * NORMALIZED-hash flip rate (after the fix). The gap is the redundant Gemini
 * spend the fix removes. Run it some time AFTER a daily collect so the stored
 * text and the fresh scrape span a real interval.
 *
 * It writes NOTHING — safe to run against prod.
 *
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/measure-hash-thrash.ts --company=<slug> [--limit=N]
 *
 * Only API-scraped companies (lever / greenhouse / workable / ashby) can be
 * re-scraped locally. Browser-scraped incumbents (Workday / Phenom / Avature /
 * Scotiabank) must be measured from the scrape-heavy GitHub Actions runner.
 */

import { createHash } from "node:crypto";
import { createAdminClient } from "../lib/supabase/admin";
import { fetchJobs, isBrowserScraper } from "../lib/scrapers";
import { normalizeDescriptionForHash } from "../lib/jobs/processor";

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

async function main() {
  const slug = process.argv.find((a) => a.startsWith("--company="))?.split("=")[1];
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 300;

  if (!slug) {
    console.error(
      "Usage: npx tsx --env-file=.env.local web/scripts/measure-hash-thrash.ts --company=<slug> [--limit=N]"
    );
    console.error(
      "API-scraped companies only (lever/greenhouse/workable/ashby); browser-scraped incumbents must run from the scrape-heavy workflow."
    );
    process.exit(1);
  }

  const supabase = createAdminClient();

  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select("id, slug, name, ats_type, ats_identifier, careers_url")
    .eq("slug", slug)
    .single();
  if (cErr || !company) {
    console.error(`Company '${slug}' not found: ${cErr?.message ?? "no row"}`);
    process.exit(1);
  }

  if (isBrowserScraper(company.ats_type)) {
    console.error(
      `'${slug}' uses a browser scraper (${company.ats_type}) — can't re-scrape locally. ` +
        "Run from the scrape-heavy GH Actions context or pick an API-scraped company."
    );
    process.exit(1);
  }

  // Current stored text + hash for active jobs (the baseline = last scrape).
  const { data: stored, error: sErr } = await supabase
    .from("job_postings")
    .select("external_id, description_text, description_hash")
    .eq("company_id", company.id)
    .eq("is_active", true)
    .limit(limit);
  if (sErr) {
    console.error(`stored fetch failed: ${sErr.message}`);
    process.exit(1);
  }
  const storedByExt = new Map<string, string>();
  for (const r of stored ?? []) storedByExt.set(r.external_id, r.description_text ?? "");

  console.log(`Re-scraping ${company.name} (${company.ats_type}/${company.ats_identifier})…`);
  const scraped = await fetchJobs(
    company.ats_type,
    company.ats_identifier,
    company.careers_url ?? undefined
  );

  let matched = 0;
  let rawFlips = 0;
  let normFlips = 0;
  for (const job of scraped) {
    const oldText = storedByExt.get(job.external_id);
    if (oldText === undefined) continue; // newly-seen job — nothing to compare against
    const newText = job.description_text ?? "";
    if (!oldText && !newText) continue;
    matched++;
    if (sha1(oldText) !== sha1(newText)) rawFlips++;
    if (
      sha1(normalizeDescriptionForHash(oldText)) !==
      sha1(normalizeDescriptionForHash(newText))
    ) {
      normFlips++;
    }
  }

  const pct = (n: number) => (matched ? `${((100 * n) / matched).toFixed(1)}%` : "n/a");
  const eliminated = rawFlips - normFlips;
  console.log("\n" + "=".repeat(64));
  console.log(`  Company:           ${company.name} (${slug})`);
  console.log(`  Matched jobs:      ${matched}`);
  console.log(`  Raw-hash flips:    ${rawFlips} (${pct(rawFlips)})   <- triggers re-extraction today`);
  console.log(`  Normalized flips:  ${normFlips} (${pct(normFlips)})   <- triggers re-extraction after the fix`);
  console.log(`  Thrash eliminated: ${eliminated} (${pct(eliminated)} of matched) — Gemini extractions avoided`);
  console.log("=".repeat(64));
  console.log("Read-only: no rows were written.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
