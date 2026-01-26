#!/usr/bin/env npx tsx
/**
 * Check Questrade Job Run Status
 * 
 * Checks the status of the most recent job run for Questrade and shows what was scraped.
 */

import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const supabase = createAdminClient();
  const companyId = "4a99a35d-9794-4eaf-a3df-c37162fdceef";

  console.log("🔍 Checking Questrade Job Run Status\n");
  console.log("═".repeat(70));

  // Get the most recent job run for Questrade
  const { data: jobRuns, error: jobRunError } = await supabase
    .from("job_runs")
    .select("*")
    .eq("company_id", companyId)
    .order("started_at", { ascending: false })
    .limit(5);

  if (jobRunError) {
    console.error("❌ Error fetching job runs:", jobRunError);
    process.exit(1);
  }

  if (!jobRuns || jobRuns.length === 0) {
    console.log("⚠️  No job runs found for Questrade");
    process.exit(1);
  }

  console.log(`📋 Found ${jobRuns.length} recent job run(s)\n`);

  for (const jobRun of jobRuns) {
    console.log(`Job Run: ${jobRun.id}`);
    console.log(`  Type: ${jobRun.job_type}`);
    console.log(`  Trigger: ${jobRun.trigger_type}`);
    console.log(`  Status: ${jobRun.status}`);
    console.log(`  Started: ${jobRun.started_at}`);
    console.log(`  Completed: ${jobRun.completed_at || "N/A"}`);
    console.log(`  Companies: ${jobRun.total_companies || 0}`);
    console.log(`  New Jobs: ${jobRun.total_new_jobs || 0}`);
    console.log(`  Updated Jobs: ${jobRun.total_updated_jobs || 0}`);
    console.log(`  Closed Jobs: ${jobRun.total_closed_jobs || 0}`);

    // Get tasks for this job run
    const { data: tasks, error: tasksError } = await supabase
      .from("job_run_tasks")
      .select("*")
      .eq("job_run_id", jobRun.id)
      .order("started_at", { ascending: false });

    if (tasksError) {
      console.log(`  ⚠️  Error fetching tasks: ${tasksError.message}`);
    } else if (tasks && tasks.length > 0) {
      console.log(`\n  Tasks (${tasks.length}):`);
      for (const task of tasks) {
        console.log(`    Task: ${task.id}`);
        console.log(`      Status: ${task.status}`);
        console.log(`      Stage: ${task.current_stage || "N/A"}`);
        console.log(`      Jobs Fetched: ${task.jobs_fetched || 0}`);
        console.log(`      New Jobs: ${task.new_jobs || 0}`);
        console.log(`      Updated Jobs: ${task.updated_jobs || 0}`);
        if (task.error_message) {
          console.log(`      ❌ Error: ${task.error_message}`);
          console.log(`      Error Stage: ${task.error_stage || "N/A"}`);
        }
        if (task.scraped_data) {
          const scrapedJobs = Array.isArray(task.scraped_data) ? task.scraped_data : [];
          console.log(`      Scraped Data: ${scrapedJobs.length} jobs`);
          if (scrapedJobs.length > 0) {
            const firstJob = scrapedJobs[0] as any;
            console.log(`      Sample Job:`);
            console.log(`        Title: ${firstJob.title || "N/A"}`);
            console.log(`        Description HTML Length: ${firstJob.description_html?.length || 0}`);
            console.log(`        Description Text Length: ${firstJob.description_text?.length || 0}`);
            console.log(`        Location: ${firstJob.location || "N/A"}`);
          }
        }
      }
    }

    console.log("\n" + "─".repeat(70) + "\n");
  }

  // Check current job postings
  console.log("📊 Current Questrade Job Postings:\n");
  const { data: jobs, error: jobsError } = await supabase
    .from("job_postings")
    .select("id, title, description_html, description_text, last_seen_date")
    .eq("company_id", companyId)
    .order("last_seen_date", { ascending: false })
    .limit(10);

  if (jobsError) {
    console.error("❌ Error fetching jobs:", jobsError);
  } else if (jobs && jobs.length > 0) {
    console.log(`Found ${jobs.length} recent job(s):\n`);
    for (const job of jobs) {
      const htmlLen = job.description_html?.length || 0;
      const textLen = job.description_text?.length || 0;
      const hasDesc = htmlLen > 200 || textLen > 200;
      console.log(`  ${job.title}`);
      console.log(`    Description HTML: ${htmlLen} chars ${hasDesc ? "✅" : "❌"}`);
      console.log(`    Description Text: ${textLen} chars ${hasDesc ? "✅" : "❌"}`);
      console.log(`    Last Seen: ${job.last_seen_date}`);
      console.log();
    }
  } else {
    console.log("⚠️  No jobs found in database");
  }
}

main().catch(console.error);
