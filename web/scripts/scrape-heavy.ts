/**
 * Heavy Scraper Script for GitHub Actions
 * 
 * Runs browser-based scraping using full puppeteer (not puppeteer-core)
 * for environments that support it (e.g., GitHub Actions).
 * 
 * Usage:
 *   COMPANY_ID=<uuid> [TASK_ID=<uuid>] npx tsx web/scripts/scrape-heavy.ts
 * 
 * Environment Variables:
 *   COMPANY_ID - UUID of the company to scrape (required)
 *   TASK_ID - UUID of existing task to update (optional, creates new task if not provided)
 *   NEXT_PUBLIC_SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key
 */

import puppeteer from "puppeteer";
import type { Browser } from "puppeteer-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchJobs } from "@/lib/scrapers";
import { runIngestStage } from "@/lib/jobs/processor";
import type { Company } from "@/lib/jobs/types";

async function main() {
  console.log("🚀 Starting heavy scraper script...");

  // Step 1: Get COMPANY_ID and optional TASK_ID from environment
  const companyId = process.env.COMPANY_ID;
  const taskId = process.env.TASK_ID;
  
  if (!companyId) {
    console.error("❌ Error: COMPANY_ID environment variable is required");
    process.exit(1);
  }
  console.log(`📋 Company ID: ${companyId}`);
  if (taskId) {
    console.log(`📋 Task ID: ${taskId} (will update existing task)`);
  } else {
    console.log(`📋 No TASK_ID provided (will create new task)`);
  }

  // Step 2: Initialize Supabase Admin Client
  console.log("🔌 Initializing Supabase admin client...");
  const supabase = createAdminClient();

  // Validate environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("❌ Error: NEXT_PUBLIC_SUPABASE_URL environment variable is required");
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required");
    process.exit(1);
  }

  // Step 3: Fetch Company record
  console.log(`🔍 Fetching company record for ID: ${companyId}...`);
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (companyError || !company) {
    console.error(`❌ Error fetching company: ${companyError?.message || "Company not found"}`);
    process.exit(1);
  }
  console.log(`✅ Found company: ${company.name} (${company.ats_type})`);

  // Step 4: Launch full puppeteer browser instance
  console.log("🌐 Launching Puppeteer browser...");
  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
      ],
    });
    console.log("✅ Browser launched successfully");
  } catch (error) {
    console.error(`❌ Error launching browser: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Step 5: Get or create task for tracking (required by runIngestStage)
  let task: { id: string; job_run_id: string } | null = null;
  let jobRun: { id: string } | null = null;

  if (taskId) {
    // Update existing task
    console.log(`📝 Updating existing task: ${taskId}...`);
    
    // Fetch existing task
    const { data: existingTask, error: taskFetchError } = await supabase
      .from("job_run_tasks")
      .select("id, job_run_id")
      .eq("id", taskId)
      .single();

    if (taskFetchError || !existingTask) {
      console.error(`❌ Error fetching existing task: ${taskFetchError?.message || "Task not found"}`);
      await browser?.close();
      process.exit(1);
    }

    task = { id: existingTask.id, job_run_id: existingTask.job_run_id };
    
    // Fetch the job run to verify it exists
    const { data: existingJobRun, error: jobRunFetchError } = await supabase
      .from("job_runs")
      .select("id")
      .eq("id", existingTask.job_run_id)
      .single();

    if (jobRunFetchError || !existingJobRun) {
      console.error(`❌ Error: Job run not found for task ${taskId}`);
      await browser?.close();
      process.exit(1);
    }
    jobRun = existingJobRun;

    // Update task status to running
    const { error: updateError } = await supabase
      .from("job_run_tasks")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        current_stage: "scrape",
        error_message: null,
        error_stage: null,
      })
      .eq("id", taskId);

    if (updateError) {
      console.error(`❌ Error updating task: ${updateError.message}`);
      await browser?.close();
      process.exit(1);
    }

    // Update job run status to running
    await supabase
      .from("job_runs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
      })
      .eq("id", jobRun.id);

    console.log(`✅ Updated existing task: ${task.id}`);
  } else {
    // Create new task (backward compatibility)
    console.log("📝 Creating new job run task...");
    const { data: newJobRun, error: jobRunError } = await supabase
      .from("job_runs")
      .insert({
        job_type: "collect",
        trigger_type: "manual",
        scope: "single",
        company_id: companyId,
        status: "running",
        started_at: new Date().toISOString(),
        total_companies: 1,
      })
      .select("id")
      .single();

    if (jobRunError || !newJobRun) {
      console.error(`❌ Error creating job run: ${jobRunError?.message || "Unknown error"}`);
      await browser?.close();
      process.exit(1);
    }
    jobRun = newJobRun;

    const { data: newTask, error: taskError } = await supabase
      .from("job_run_tasks")
      .insert({
        job_run_id: jobRun.id,
        company_id: companyId,
        status: "running",
        started_at: new Date().toISOString(),
        current_stage: "scrape",
        stage_progress: {},
      })
      .select("id")
      .single();

    if (taskError || !newTask) {
      console.error(`❌ Error creating task: ${taskError?.message || "Unknown error"}`);
      await browser?.close();
      process.exit(1);
    }
    task = { id: newTask.id, job_run_id: jobRun.id };
    console.log(`✅ Created new task: ${task.id}`);
  }

  try {
    // Step 6: Fetch jobs using browser instance
    console.log(`🔎 Fetching jobs for ${company.name}...`);
    const jobs = await fetchJobs(
      company.ats_type,
      company.ats_identifier || "",
      company.careers_url || undefined,
      browser
    );
    console.log(`✅ Fetched ${jobs.length} jobs`);

    // Step 7: Store scraped data in task
    await supabase
      .from("job_run_tasks")
      .update({
        scraped_data: jobs,
        jobs_fetched: jobs.length,
        stage_progress: {
          scrape: {
            status: "completed",
            completedAt: new Date().toISOString(),
            jobs_fetched: jobs.length,
          },
        },
      })
      .eq("id", task.id);

    // Step 8: Call runIngestStage to save results
    console.log("💾 Ingesting jobs into database...");
    const ingestResult = await runIngestStage(task.id, company as Company, jobs);
    console.log(`✅ Ingest complete:`);
    console.log(`   - New jobs: ${ingestResult.newJobIds.length}`);
    console.log(`   - Updated jobs: ${ingestResult.updated}`);
    console.log(`   - Closed jobs: ${ingestResult.closed}`);

    // Mark task as completed
    await supabase
      .from("job_run_tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        current_stage: "done",
      })
      .eq("id", task.id);

    // Update job run
    await supabase
      .from("job_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_companies: 1,
        total_new_jobs: ingestResult.newJobIds.length,
        total_updated_jobs: ingestResult.updated,
        total_closed_jobs: ingestResult.closed,
      })
      .eq("id", jobRun.id);

    console.log("✅ Scraping completed successfully!");
  } catch (error) {
    console.error(`❌ Error during scraping: ${error instanceof Error ? error.message : String(error)}`);
    
    // Mark task as failed
    await supabase
      .from("job_run_tasks")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : String(error),
        error_stage: "scrape",
      })
      .eq("id", task.id);

    await supabase
      .from("job_runs")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : String(error),
        failed_companies: 1,
      })
      .eq("id", jobRun.id);

    throw error;
  } finally {
    // Step 9: Close browser
    if (browser) {
      console.log("🔒 Closing browser...");
      await browser.close();
      console.log("✅ Browser closed");
    }
  }
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
