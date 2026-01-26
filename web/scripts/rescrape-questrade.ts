#!/usr/bin/env npx tsx
/**
 * Rescrape Questrade Jobs
 * 
 * Triggers a new collection job for Questrade to rescrape all jobs
 * with the updated Dayforce browser scraper that properly extracts descriptions.
 * 
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/rescrape-questrade.ts
 */

import { createAdminClient } from "../lib/supabase/admin";
import { createJobRun, executeCollectionJob, triggerAnalysisJobIfNeeded } from "../lib/jobs";

async function main() {
  console.log("🔄 Rescraping Questrade Jobs\n");
  console.log("═".repeat(70));

  const supabase = createAdminClient();

  // Get Questrade company (use hardcoded ID to match other scripts)
  const companyId = "4a99a35d-9794-4eaf-a3df-c37162fdceef";
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, slug, ats_type, ats_identifier, is_active")
    .eq("id", companyId)
    .single();

  if (companyError || !company) {
    console.error("❌ Questrade company not found:", companyError?.message);
    process.exit(1);
  }

  console.log(`📋 Company: ${company.name} (${company.slug})`);
  console.log(`   ATS Type: ${company.ats_type}`);
  console.log(`   ATS Identifier: ${company.ats_identifier}`);
  console.log(`   Company ID: ${company.id}\n`);

  if (!company.is_active) {
    console.log("⚠️  Company is not active. Activating...\n");
    const { error: activateError } = await supabase
      .from("companies")
      .update({ is_active: true })
      .eq("id", companyId);
    
    if (activateError) {
      console.error("❌ Failed to activate company:", activateError.message);
      process.exit(1);
    }
    console.log("✅ Company activated\n");
  }

  // Check for existing running job for this company
  const { data: existingRunningTask } = await supabase
    .from("job_run_tasks")
    .select("job_run_id, status, started_at")
    .eq("company_id", companyId)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (existingRunningTask) {
    console.log(`⚠️  A job is already running for this company`);
    console.log(`   Job Run ID: ${existingRunningTask.job_run_id}`);
    console.log(`   Started: ${existingRunningTask.started_at}`);
    console.log(`\n   Please wait for the current job to complete or cancel it first.`);
    process.exit(1);
  }

  console.log("🚀 Creating collection job...\n");

  try {
    // Create job run
    const jobRunId = await createJobRun({
      jobType: 'collect',
      triggerType: 'manual',
      companyIds: [companyId],
    });

    console.log(`✅ Created job run: ${jobRunId}\n`);
    console.log("🔄 Executing collection job...");
    console.log("   (This may take several minutes, especially for browser-based scrapers)\n");

    // Execute the collection job
    // Note: For Dayforce (browser scraper), this will be offloaded to GitHub Actions
    const result = await executeCollectionJob(jobRunId);

    console.log("\n" + "═".repeat(70));
    console.log("📊 Collection Job Results:");
    console.log("═".repeat(70));
    console.log(`  Job Run ID: ${jobRunId}`);
    console.log(`  Status: ${result.status}`);
    if (result.stats) {
      console.log(`  Companies Processed: ${result.stats.companiesProcessed || 0}`);
      console.log(`  Jobs Scraped: ${result.stats.jobsScraped || 0}`);
      console.log(`  Jobs Ingested: ${result.stats.jobsIngested || 0}`);
      console.log(`  New Jobs: ${result.stats.newJobs || 0}`);
      console.log(`  Updated Jobs: ${result.stats.updatedJobs || 0}`);
    }
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }

    // Auto-trigger analysis job if there are new jobs
    console.log("\n🔄 Checking if analysis job is needed...");
    await triggerAnalysisJobIfNeeded(jobRunId);
    console.log("✅ Analysis job triggered if needed\n");

    console.log("✅ Rescrape complete!");
    console.log(`\n   View job details in the dashboard or check job_run_id: ${jobRunId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("\n❌ Error during rescrape:", errorMessage);
    console.error("\n   This may be due to:");
    console.error("   - Browser scraping offloaded to GitHub Actions (check GitHub Actions)");
    console.error("   - Network issues");
    console.error("   - Invalid company configuration");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
