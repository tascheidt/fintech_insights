#!/usr/bin/env npx tsx
/**
 * Check status of Stage 1 reprocess jobs.
 *
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/check-reprocess-status.ts
 *   npx tsx --env-file=.env.local web/scripts/check-reprocess-status.ts <jobRunId>
 */

import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const jobRunId = process.argv[2];

  const supabase = createAdminClient();

  if (jobRunId) {
    // Fetch specific job
    const { data, error } = await supabase
      .from("job_runs")
      .select("id, job_type, status, started_at, completed_at, error_message, details")
      .eq("id", jobRunId)
      .single();

    if (error || !data) {
      console.error("Job not found:", error?.message ?? "No data");
      process.exit(1);
    }

    const details = (data.details as Record<string, unknown>) ?? {};
    const totalJobs = details.totalJobs as number | undefined;
    const processedJobs = details.processedJobs as number | undefined;
    const failedJobs = details.failedJobs as number | undefined;

    console.log("Job Run Status");
    console.log("═".repeat(50));
    console.log("ID:       ", data.id);
    console.log("Status:   ", data.status);
    console.log("Started:  ", data.started_at);
    console.log("Completed:", data.completed_at ?? "—");
    if (data.error_message) console.log("Error:    ", data.error_message);
    console.log("");
    console.log("Progress:");
    console.log(`  Total:    ${totalJobs ?? "—"}`);
    console.log(`  Processed: ${processedJobs ?? "—"}`);
    console.log(`  Failed:   ${failedJobs ?? "—"}`);
    if (typeof totalJobs === "number" && typeof processedJobs === "number" && totalJobs > 0) {
      const pct = Math.round((processedJobs / totalJobs) * 100);
      console.log(`  Progress: ${pct}%`);
    }
    return;
  }

  // Fetch recent reprocess jobs
  const { data: runs, error } = await supabase
    .from("job_runs")
    .select("id, status, started_at, completed_at, error_message, details")
    .eq("trigger_type", "admin")
    .order("started_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Failed to fetch jobs:", error.message);
    process.exit(1);
  }

  const reprocessRuns = (runs ?? []).filter(
    (r) => (r.details as Record<string, unknown>)?.operation === "job-structure-reprocess"
  );

  if (reprocessRuns.length === 0) {
    console.log("No Stage 1 reprocess jobs found.");
    return;
  }

  console.log("Recent Stage 1 Reprocess Jobs");
  console.log("═".repeat(50));

  for (const r of reprocessRuns) {
    const d = (r.details as Record<string, unknown>) ?? {};
    const total = d.totalJobs as number | undefined;
    const processed = d.processedJobs as number | undefined;
    const failed = d.failedJobs as number | undefined;
    const pct =
      typeof total === "number" && typeof processed === "number" && total > 0
        ? Math.round((processed / total) * 100)
        : null;

    console.log(`\n${r.id}`);
    console.log(`  Status:   ${r.status}`);
    console.log(`  Started:  ${r.started_at}`);
    console.log(`  Completed: ${r.completed_at ?? "—"}`);
    console.log(`  Progress: ${processed ?? "—"}/${total ?? "—"} (${failed ?? 0} failed)${pct != null ? ` — ${pct}%` : ""}`);
    if (r.error_message) console.log(`  Error:    ${r.error_message}`);
  }

  console.log("\nTo check a specific job:");
  console.log(`  npx tsx --env-file=.env.local web/scripts/check-reprocess-status.ts ${reprocessRuns[0]?.id ?? "<jobRunId>"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
