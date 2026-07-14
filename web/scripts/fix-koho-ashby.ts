/**
 * One-off fix: repoint Koho's `companies` row at its current ATS board.
 *
 * Koho's postings now live on Ashby (https://jobs.ashbyhq.com/koho — same
 * platform as Wealthsimple, served by the existing `web/lib/scrapers/ashby.ts`
 * scraper). The stored config predates that move, so the daily collect cron
 * has not brought in any Koho jobs for a while even though the board is
 * live and full of open roles (July 2026).
 *
 * What this does, in order:
 *   1. Hits the live Ashby posting API for `koho` and aborts unless it
 *      returns at least one job — never repoints config at a dead board.
 *   2. Prints Koho's current row (the "before" state, for the record),
 *      then updates ats_type/ats_identifier/careers_url and re-activates
 *      the company. Inserts the row (default org, tier=fintech) only if it
 *      somehow doesn't exist.
 *   3. Triggers a manual one-company collect run so jobs land immediately
 *      instead of waiting for the next 6 AM cron (Ashby is API-based, so
 *      this runs inline — no GitHub Actions offload).
 *
 * Usage (from `web/`):
 *   npx tsx --env-file=.env.local scripts/fix-koho-ashby.ts
 *
 * Idempotent: re-runs re-verify the board, re-apply the same config, and
 * kick another collect (which upserts by external id — safe).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAshbyJobs } from "@/lib/scrapers/ashby";
import { createJobRun, executeCollectionJob, triggerAnalysisJobIfNeeded } from "@/lib/jobs";

const SLUG = "koho";
const ATS_TYPE = "ashby";
const ATS_IDENTIFIER = "koho";
const CAREERS_URL = "https://jobs.ashbyhq.com/koho";

async function main(): Promise<void> {
  // 1. Verify the Ashby board is live before touching any config.
  console.log(`[fix-koho-ashby] verifying live Ashby board '${ATS_IDENTIFIER}'...`);
  const jobs = await fetchAshbyJobs(ATS_IDENTIFIER);
  if (jobs.length === 0) {
    throw new Error(
      "[fix-koho-ashby] Ashby returned 0 jobs for 'koho' — refusing to " +
        "repoint config at an empty board. Check https://jobs.ashbyhq.com/koho manually."
    );
  }
  console.log(`[fix-koho-ashby] board is live: ${jobs.length} open roles`);

  const supabase = createAdminClient();

  // 2. Fix the company row.
  const { data: existing, error: lookupErr } = await supabase
    .from("companies")
    .select("id, name, slug, ats_type, ats_identifier, careers_url, is_active, tier")
    .eq("slug", SLUG)
    .maybeSingle();
  if (lookupErr) {
    throw new Error(`[fix-koho-ashby] company lookup failed: ${lookupErr.message}`);
  }

  let companyId: string;
  if (existing) {
    console.log(`[fix-koho-ashby] current config:`, existing);
    const { error: updateErr } = await supabase
      .from("companies")
      .update({
        ats_type: ATS_TYPE,
        ats_identifier: ATS_IDENTIFIER,
        careers_url: CAREERS_URL,
        is_active: true,
      })
      .eq("id", existing.id);
    if (updateErr) {
      throw new Error(`[fix-koho-ashby] update failed: ${updateErr.message}`);
    }
    companyId = existing.id;
    console.log(`[fix-koho-ashby] updated ${SLUG} → ${ATS_TYPE}/${ATS_IDENTIFIER}, is_active=true`);
  } else {
    // Row missing entirely — insert it the same way seed-revolut-canada.ts does.
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", "default")
      .single();
    if (orgErr || !org) {
      throw new Error(
        `[fix-koho-ashby] default organization not found: ${orgErr?.message ?? "no row"}`
      );
    }
    const { data: inserted, error: insertErr } = await supabase
      .from("companies")
      .insert({
        organization_id: org.id,
        name: "Koho",
        slug: SLUG,
        country: "CA",
        ats_type: ATS_TYPE,
        ats_identifier: ATS_IDENTIFIER,
        careers_url: CAREERS_URL,
        is_active: true,
        tier: "fintech" as const,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      throw new Error(`[fix-koho-ashby] insert failed: ${insertErr?.message ?? "no row"}`);
    }
    companyId = inserted.id;
    console.log(`[fix-koho-ashby] inserted new ${SLUG} row`);
  }

  // 3. Collect now — don't wait for tomorrow's 6 AM cron.
  const { data: runningTask } = await supabase
    .from("job_run_tasks")
    .select("job_run_id, started_at")
    .eq("company_id", companyId)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runningTask) {
    console.log(
      `[fix-koho-ashby] a collect task is already running for Koho ` +
        `(job_run ${runningTask.job_run_id}, started ${runningTask.started_at}); ` +
        `config is fixed — skipping the manual run.`
    );
    return;
  }

  console.log(`[fix-koho-ashby] triggering manual collect for Koho...`);
  const jobRunId = await createJobRun({
    jobType: "collect",
    triggerType: "manual",
    companyIds: [companyId],
  });
  const result = await executeCollectionJob(jobRunId);
  console.log(`[fix-koho-ashby] collect ${result.status} (job_run ${jobRunId}):`, result.stats);

  await triggerAnalysisJobIfNeeded(jobRunId);
  console.log(`[fix-koho-ashby] done. Koho rejoins the daily 6 AM collect cron from here.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
