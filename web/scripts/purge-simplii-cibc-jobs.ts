/**
 * One-off: purge CIBC jobs incorrectly assigned to Simplii Financial.
 *
 * Before the parent_company_id routing mechanism was active, Simplii's
 * scrape pulled the entire CIBC Workday corpus (~504 jobs) and ingested
 * them all under Simplii's company_id. This script deletes the non-Simplii
 * jobs while preserving any rows that genuinely belong to Simplii (matched
 * by the same word-boundary regex used by `isSimpliiPosting` in
 * `workday-cibc.ts`).
 *
 * Safe to re-run — it only deletes rows that don't carry a Simplii signal.
 *
 * Usage (from `web/`):
 *   npx tsx --env-file=.env.local scripts/purge-simplii-cibc-jobs.ts
 *
 * Pass --dry-run to preview without deleting:
 *   npx tsx --env-file=.env.local scripts/purge-simplii-cibc-jobs.ts --dry-run
 */

import { createAdminClient } from "../lib/supabase/admin";

const SIMPLII_PATTERN = /\bsimplii\b/i;
const DRY_RUN = process.argv.includes("--dry-run");

function hasSimpliiSignal(title: string | null, department: string | null): boolean {
  if (title && SIMPLII_PATTERN.test(title)) return true;
  if (department && SIMPLII_PATTERN.test(department)) return true;
  return false;
}

async function main(): Promise<void> {
  const supabase = createAdminClient();

  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("id, name, slug, parent_company_id")
    .eq("slug", "simplii")
    .single();

  if (companyErr || !company) {
    console.error(`Simplii company row not found: ${companyErr?.message}`);
    process.exit(1);
  }

  console.log(`Target: ${company.name} (${company.slug}), id=${company.id}`);
  console.log(`parent_company_id: ${company.parent_company_id ?? "NULL"}`);

  if (!company.parent_company_id) {
    console.warn(
      "⚠️  Simplii has no parent_company_id set. The collect cron will " +
      "scrape it independently, re-creating the same problem. Run the " +
      "parent_company migration first."
    );
  }

  const { data: jobs, error: jobsErr } = await supabase
    .from("job_postings")
    .select("id, external_id, title, department, is_active")
    .eq("company_id", company.id);

  if (jobsErr) {
    console.error(`Failed to fetch jobs: ${jobsErr.message}`);
    process.exit(1);
  }

  if (!jobs || jobs.length === 0) {
    console.log("No jobs found under Simplii. Nothing to purge.");
    return;
  }

  const genuineSimplii: typeof jobs = [];
  const cibcMisattributed: typeof jobs = [];

  for (const job of jobs) {
    if (hasSimpliiSignal(job.title, job.department)) {
      genuineSimplii.push(job);
    } else {
      cibcMisattributed.push(job);
    }
  }

  console.log(`\nTotal jobs under Simplii: ${jobs.length}`);
  console.log(`  Genuine Simplii (keeping): ${genuineSimplii.length}`);
  console.log(`  CIBC mis-attributed (purging): ${cibcMisattributed.length}`);

  if (genuineSimplii.length > 0) {
    console.log("\nSimplii jobs being kept:");
    for (const j of genuineSimplii) {
      console.log(`  [${j.is_active ? "active" : "closed"}] ${j.title}`);
    }
  }

  if (cibcMisattributed.length === 0) {
    console.log("\nNo mis-attributed jobs to purge. Database is clean.");
    return;
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: would delete the following jobs:");
    for (const j of cibcMisattributed.slice(0, 20)) {
      console.log(`  ${j.external_id} — ${j.title}`);
    }
    if (cibcMisattributed.length > 20) {
      console.log(`  ... and ${cibcMisattributed.length - 20} more`);
    }
    console.log("\nRe-run without --dry-run to execute.");
    return;
  }

  const idsToDelete = cibcMisattributed.map((j) => j.id);

  // Delete in batches to avoid hitting Supabase's query-size limits.
  const BATCH = 200;
  let deleted = 0;
  for (let i = 0; i < idsToDelete.length; i += BATCH) {
    const batch = idsToDelete.slice(i, i + BATCH);
    const { error: delErr } = await supabase
      .from("job_postings")
      .delete()
      .in("id", batch);

    if (delErr) {
      console.error(`Delete batch failed at offset ${i}: ${delErr.message}`);
      process.exit(1);
    }
    deleted += batch.length;
    console.log(`  deleted ${deleted}/${idsToDelete.length}`);
  }

  console.log(`\nPurged ${deleted} CIBC jobs from Simplii's company_id.`);
  console.log(
    `Remaining: ${genuineSimplii.length} genuine Simplii job(s). ` +
    `The next CIBC scrape will repopulate via companySlugOverride routing.`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
