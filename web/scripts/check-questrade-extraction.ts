#!/usr/bin/env npx tsx
/**
 * Check Questrade Extraction Status
 * 
 * Checks if LLM extraction ran and what fields were populated.
 */

import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const supabase = createAdminClient();

  const { data: jobs } = await supabase
    .from("job_postings")
    .select("id, title, description_text, function_category, summary, seniority_level, tech_stack, location, standardized_department")
    .eq("company_id", "4a99a35d-9794-4eaf-a3df-c37162fdceef")
    .not("description_text", "is", null)
    .limit(5);

  if (!jobs || jobs.length === 0) {
    console.log("No jobs found");
    return;
  }

  console.log(`Found ${jobs.length} jobs\n`);

  jobs.forEach((job, i) => {
    console.log(`${i + 1}. ${job.title}`);
    console.log(`   function_category: ${job.function_category || "NULL"}`);
    console.log(`   summary: ${job.summary ? `EXISTS (${job.summary.length} chars)` : "NULL"}`);
    console.log(`   seniority_level: ${job.seniority_level || "NULL"}`);
    console.log(`   tech_stack: ${Array.isArray(job.tech_stack) ? `${job.tech_stack.length} items` : "NULL"}`);
    console.log(`   location: ${job.location || "NULL"}`);
    console.log(`   standardized_department: ${job.standardized_department || "NULL"}`);
    console.log();
  });

  // Check if extraction ran but didn't populate all fields
  const withFunctionCategory = jobs.filter(j => j.function_category).length;
  const withSummary = jobs.filter(j => j.summary).length;
  const withSeniority = jobs.filter(j => j.seniority_level).length;
  const withTechStack = jobs.filter(j => Array.isArray(j.tech_stack) && j.tech_stack.length > 0).length;

  console.log("Extraction Status:");
  console.log(`  function_category: ${withFunctionCategory}/${jobs.length}`);
  console.log(`  summary: ${withSummary}/${jobs.length}`);
  console.log(`  seniority_level: ${withSeniority}/${jobs.length}`);
  console.log(`  tech_stack: ${withTechStack}/${jobs.length}`);

  if (withFunctionCategory > 0 && withSummary === 0) {
    console.log("\n⚠️  Extraction ran (function_category exists) but other fields missing.");
    console.log("   This suggests extraction completed but didn't return all fields.");
    console.log("   May need to backfill or re-run extraction.");
  }
}

main().catch(console.error);
