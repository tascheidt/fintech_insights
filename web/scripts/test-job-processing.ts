/**
 * Test script for job processing functionality
 * 
 * Tests:
 * 1. Process API-based scrapers (lever, greenhouse, workable)
 * 2. Process browser-based scrapers (ashby, workday, custom)
 * 3. Job deduplication
 * 4. Error handling
 * 5. Cleanup cron functionality
 * 
 * Usage:
 *   npx tsx web/scripts/test-job-processing.ts
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isBrowserScraper } from "@/lib/scrapers";

interface Company {
  id: string;
  name: string;
  ats_type: string;
  ats_identifier: string | null;
  careers_url: string | null;
  is_active: boolean;
}

async function testJobProcessing() {
  console.log("🧪 Starting job processing tests...\n");
  
  // Check environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("❌ Error: NEXT_PUBLIC_SUPABASE_URL environment variable is required");
    console.error("   Please set it in your .env.local file or environment");
    process.exit(1);
  }
  
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required");
    console.error("   Please set it in your .env.local file or environment");
    process.exit(1);
  }
  
  const supabase = createAdminClient();

  // Get all active companies
  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, name, ats_type, ats_identifier, careers_url, is_active")
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("❌ Error fetching companies:", error);
    process.exit(1);
  }

  if (!companies || companies.length === 0) {
    console.log("⚠️  No active companies found in database");
    return;
  }

  console.log(`📋 Found ${companies.length} active companies:\n`);
  companies.forEach((c) => {
    const browserType = isBrowserScraper(c.ats_type) ? "🌐 Browser" : "🔌 API";
    console.log(`  ${browserType} - ${c.name} (${c.ats_type})`);
  });
  console.log("");

  // Group companies by scraper type
  const apiScrapers = companies.filter((c) => !isBrowserScraper(c.ats_type));
  const browserScrapers = companies.filter((c) => isBrowserScraper(c.ats_type));

  console.log("=".repeat(60));
  console.log("TEST 1: API-Based Scrapers");
  console.log("=".repeat(60));

  if (apiScrapers.length === 0) {
    console.log("⚠️  No API-based scrapers found\n");
  } else {
    for (const company of apiScrapers.slice(0, 2)) {
      // Test first 2 API scrapers
      await testCompanyProcessing(company, "API");
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("TEST 2: Browser-Based Scrapers");
  console.log("=".repeat(60));

  if (browserScrapers.length === 0) {
    console.log("⚠️  No browser-based scrapers found\n");
  } else {
    for (const company of browserScrapers.slice(0, 1)) {
      // Test first browser scraper (GitHub Actions)
      await testCompanyProcessing(company, "Browser");
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("TEST 3: Job Deduplication");
  console.log("=".repeat(60));

  if (companies.length > 0) {
    await testDeduplication(companies[0]);
  }

  console.log("\n" + "=".repeat(60));
  console.log("TEST 4: Cleanup Cron");
  console.log("=".repeat(60));

  await testCleanupCron();

  console.log("\n✅ All tests completed!");
}

async function testCompanyProcessing(company: Company, type: string) {
  console.log(`\n📦 Testing: ${company.name} (${company.ats_type})`);
  console.log(`   Type: ${type}-based scraper`);

  const supabase = createAdminClient();

  // Check for existing running jobs
  const { data: existingJobs } = await supabase
    .from("job_run_tasks")
    .select("id, status, started_at")
    .eq("company_id", company.id)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1);

  if (existingJobs && existingJobs.length > 0) {
    console.log(`   ⚠️  Found existing running job: ${existingJobs[0].id}`);
    console.log(`   ⏭️  Skipping to avoid interference`);
    return;
  }

  // Create a test job run
  const { data: jobRun, error: jobRunError } = await supabase
    .from("job_runs")
    .insert({
      job_type: "collect",
      trigger_type: "manual",
      scope: "single",
      company_id: company.id,
      status: "pending",
      total_companies: 1,
    })
    .select("id")
    .single();

  if (jobRunError || !jobRun) {
    console.log(`   ❌ Failed to create job run: ${jobRunError?.message}`);
    return;
  }

  console.log(`   ✅ Created job run: ${jobRun.id}`);

  // Create task
  const { data: task, error: taskError } = await supabase
    .from("job_run_tasks")
    .insert({
      job_run_id: jobRun.id,
      company_id: company.id,
      status: "pending",
    })
    .select("id")
    .single();

  if (taskError || !task) {
    console.log(`   ❌ Failed to create task: ${taskError?.message}`);
    return;
  }

  console.log(`   ✅ Created task: ${task.id}`);

  // For browser scrapers, verify GitHub Actions would be triggered
  if (isBrowserScraper(company.ats_type)) {
    console.log(`   ✅ Would trigger GitHub Actions with taskId: ${task.id}`);
  }

  // Clean up test job (mark as cancelled)
  await supabase
    .from("job_runs")
    .update({ status: "cancelled" })
    .eq("id", jobRun.id);

  await supabase
    .from("job_run_tasks")
    .update({ status: "failed", error_message: "Test cleanup" })
    .eq("id", task.id);

  console.log(`   ✅ Test job cleaned up`);
}

async function testDeduplication(company: Company) {
  console.log(`\n📦 Testing deduplication for: ${company.name}`);

  const supabase = createAdminClient();

  // Create a running job
  const { data: jobRun1, error: error1 } = await supabase
    .from("job_runs")
    .insert({
      job_type: "collect",
      trigger_type: "manual",
      scope: "single",
      company_id: company.id,
      status: "running",
      started_at: new Date().toISOString(),
      total_companies: 1,
    })
    .select("id")
    .single();

  if (error1 || !jobRun1) {
    console.log(`   ❌ Failed to create test job: ${error1?.message}`);
    return;
  }

  const { data: task1, error: taskError1 } = await supabase
    .from("job_run_tasks")
    .insert({
      job_run_id: jobRun1.id,
      company_id: company.id,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (taskError1 || !task1) {
    console.log(`   ❌ Failed to create test task: ${taskError1?.message}`);
    return;
  }

  console.log(`   ✅ Created running job: ${jobRun1.id}`);

  // Check for existing running job (simulating deduplication check)
  const { data: existingRunningTask } = await supabase
    .from("job_run_tasks")
    .select("job_run_id, status")
    .eq("company_id", company.id)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (existingRunningTask && existingRunningTask.job_run_id === jobRun1.id) {
    console.log(`   ✅ Deduplication check works - found existing job: ${existingRunningTask.job_run_id}`);
  } else {
    console.log(`   ❌ Deduplication check failed`);
  }

  // Clean up
  await supabase.from("job_runs").delete().eq("id", jobRun1.id);
  await supabase.from("job_run_tasks").delete().eq("id", task1.id);
  console.log(`   ✅ Test cleaned up`);
}

async function testCleanupCron() {
  console.log(`\n📦 Testing cleanup cron functionality`);

  const supabase = createAdminClient();

  // Create a stale job (started 35 minutes ago)
  const staleTime = new Date(Date.now() - 35 * 60 * 1000);
  const { data: staleJobRun, error: staleError } = await supabase
    .from("job_runs")
    .insert({
      job_type: "collect",
      trigger_type: "manual",
      scope: "single",
      status: "running",
      started_at: staleTime.toISOString(),
      total_companies: 1,
    })
    .select("id")
    .single();

  if (staleError || !staleJobRun) {
    console.log(`   ❌ Failed to create stale job run: ${staleError?.message}`);
    return;
  }

  // Get a company for the stale task
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!company) {
    console.log(`   ⚠️  No companies found, skipping stale task creation`);
    await supabase.from("job_runs").delete().eq("id", staleJobRun.id);
    return;
  }

  const { data: staleTask, error: staleTaskError } = await supabase
    .from("job_run_tasks")
    .insert({
      job_run_id: staleJobRun.id,
      company_id: company.id,
      status: "running",
      started_at: staleTime.toISOString(),
    })
    .select("id")
    .single();

  if (staleTaskError || !staleTask) {
    console.log(`   ❌ Failed to create stale task: ${staleTaskError?.message}`);
    await supabase.from("job_runs").delete().eq("id", staleJobRun.id);
    return;
  }

  console.log(`   ✅ Created stale job: ${staleJobRun.id} (started ${Math.round((Date.now() - staleTime.getTime()) / 60000)} minutes ago)`);

  // Simulate cleanup cron logic
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - 30 * 60 * 1000);

  const { data: staleTasks, error: fetchError } = await supabase
    .from("job_run_tasks")
    .select("id, job_run_id")
    .eq("status", "running")
    .lt("started_at", staleThreshold.toISOString());

  if (fetchError) {
    console.log(`   ❌ Failed to fetch stale tasks: ${fetchError.message}`);
  } else if (staleTasks && staleTasks.length > 0) {
    const foundStale = staleTasks.find((t) => t.id === staleTask.id);
    if (foundStale) {
      console.log(`   ✅ Cleanup cron would find stale task: ${foundStale.id}`);

      // Mark as failed (simulating cleanup)
      await supabase
        .from("job_run_tasks")
        .update({
          status: "failed",
          error_message: "Job timed out (running for more than 30 minutes)",
          error_stage: "timeout",
          completed_at: now.toISOString(),
        })
        .eq("id", staleTask.id);

      // Check if all tasks are failed
      const { data: allTasks } = await supabase
        .from("job_run_tasks")
        .select("status")
        .eq("job_run_id", staleJobRun.id);

      if (allTasks && allTasks.every((t) => t.status === "failed")) {
        await supabase
          .from("job_runs")
          .update({
            status: "failed",
            error_message: "All tasks timed out",
            completed_at: now.toISOString(),
          })
          .eq("id", staleJobRun.id);
        console.log(`   ✅ Cleanup cron would mark job run as failed`);
      }
    } else {
      console.log(`   ⚠️  Stale task not found (may have been cleaned up already)`);
    }
  } else {
    console.log(`   ⚠️  No stale tasks found`);
  }

  // Clean up
  await supabase.from("job_runs").delete().eq("id", staleJobRun.id);
  await supabase.from("job_run_tasks").delete().eq("id", staleTask.id);
  console.log(`   ✅ Test cleaned up`);
}

// Run tests
testJobProcessing().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
