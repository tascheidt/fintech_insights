#!/usr/bin/env npx tsx
/**
 * Check Silver Layer Migration Status
 */

import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const supabase = createAdminClient();

  console.log("🔍 Checking Silver Layer Migration Status\n");
  console.log("═".repeat(70));

  // Check total jobs
  const { count: totalJobs } = await supabase
    .from("job_postings")
    .select("*", { count: "exact", head: true });

  console.log(`Total jobs in database: ${totalJobs || 0}\n`);

  // Check if columns exist by trying to select them
  const { data: sampleJob, error: sampleError } = await supabase
    .from("job_postings")
    .select("id, title, tech_stack, seniority_level, summary")
    .limit(1)
    .single();

  if (sampleError) {
    if (sampleError.code === "PGRST116") {
      console.log("⚠️  No jobs found in database.");
    } else if (sampleError.message?.includes("column") || sampleError.code === "42703") {
      console.log("❌ Silver Layer columns may not exist yet.");
      console.log("   Error:", sampleError.message);
      console.log("\n💡 Run the migration:");
      console.log("   npx tsx web/scripts/run-migration.ts");
    } else {
      console.log("❌ Error:", sampleError);
    }
    return;
  }

  console.log("✅ Silver Layer columns exist!\n");

  // Check how many jobs have Silver Layer data
  const { count: withTechStack } = await supabase
    .from("job_postings")
    .select("*", { count: "exact", head: true })
    .not("tech_stack", "is", null)
    .neq("tech_stack", "[]");

  const { count: withSeniority } = await supabase
    .from("job_postings")
    .select("*", { count: "exact", head: true })
    .not("seniority_level", "is", null);

  const { count: withSummary } = await supabase
    .from("job_postings")
    .select("*", { count: "exact", head: true })
    .not("summary", "is", null);

  console.log("Silver Layer Data Status:");
  console.log(`  Jobs with tech_stack: ${withTechStack || 0} / ${totalJobs || 0}`);
  console.log(`  Jobs with seniority_level: ${withSeniority || 0} / ${totalJobs || 0}`);
  console.log(`  Jobs with summary: ${withSummary || 0} / ${totalJobs || 0}`);

  if (sampleJob) {
    console.log("\n📋 Sample Job:");
    console.log(`  Title: ${sampleJob.title}`);
    console.log(`  Tech Stack: ${sampleJob.tech_stack ? JSON.stringify(sampleJob.tech_stack) : "null"}`);
    console.log(`  Seniority: ${sampleJob.seniority_level || "null"}`);
    console.log(`  Summary: ${sampleJob.summary ? sampleJob.summary.substring(0, 50) + "..." : "null"}`);
  }
}

main().catch(console.error);
