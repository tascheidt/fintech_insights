#!/usr/bin/env npx tsx
/**
 * Check Questrade Job Completeness
 */

import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const supabase = createAdminClient();
  const companyId = "4a99a35d-9794-4eaf-a3df-c37162fdceef";

  // Get all Questrade jobs with descriptions
  const { data: jobs, error } = await supabase
    .from("job_postings")
    .select(
      "id, title, description_text, description_html, summary, seniority_level, tech_stack, function_category, location, standardized_department"
    )
    .eq("company_id", companyId)
    .not("description_text", "is", null)
    .order("last_seen_date", { ascending: false });

  if (error) {
    console.error("Error:", error);
    process.exit(1);
  }

  if (!jobs || jobs.length === 0) {
    console.log("No jobs found");
    process.exit(1);
  }

  console.log(`Total Questrade jobs with descriptions: ${jobs.length}\n`);

  // Check completeness (check both description_text and description_html)
  const withDescription = jobs.filter(
    (j) => (j.description_text && j.description_text.length > 100) || (j.description_html && j.description_html.length > 100)
  ).length;
  const withSummary = jobs.filter((j) => j.summary && j.summary.length > 0).length;
  const withSeniority = jobs.filter((j) => j.seniority_level).length;
  const withFunctionCategory = jobs.filter((j) => j.function_category).length;
  const withStandardizedDept = jobs.filter((j) => j.standardized_department).length;
  const withTechStack = jobs.filter((j) => Array.isArray(j.tech_stack) && j.tech_stack.length > 0).length;
  const withLocation = jobs.filter((j) => j.location).length;

  console.log("Completeness Check:");
  console.log(`  Descriptions (>100 chars): ${withDescription}/${jobs.length} (${Math.round((withDescription / jobs.length) * 100)}%)`);
  console.log(`  Summaries: ${withSummary}/${jobs.length} (${Math.round((withSummary / jobs.length) * 100)}%)`);
  console.log(`  Seniority Levels: ${withSeniority}/${jobs.length} (${Math.round((withSeniority / jobs.length) * 100)}%)`);
  console.log(`  Function Categories: ${withFunctionCategory}/${jobs.length} (${Math.round((withFunctionCategory / jobs.length) * 100)}%)`);
  console.log(`  Standardized Departments: ${withStandardizedDept}/${jobs.length} (${Math.round((withStandardizedDept / jobs.length) * 100)}%)`);
  console.log(`  Tech Stacks: ${withTechStack}/${jobs.length} (${Math.round((withTechStack / jobs.length) * 100)}%)`);
  console.log(`  Locations: ${withLocation}/${jobs.length} (${Math.round((withLocation / jobs.length) * 100)}%)`);

  // Sample a few jobs to show details
  console.log(`\n\nSample jobs (first 3):`);
  jobs.slice(0, 3).forEach((job, i) => {
    console.log(`\n${i + 1}. ${job.title}`);
    const descLength = (job.description_text?.length || 0) + (job.description_html?.length || 0);
    console.log(`   Description: ${descLength} chars (text: ${job.description_text?.length || 0}, html: ${job.description_html?.length || 0})`);
    console.log(`   Summary: ${job.summary ? job.summary.substring(0, 80) + "..." : "NULL"}`);
    console.log(`   Seniority: ${job.seniority_level || "NULL"}`);
    console.log(`   Function: ${job.function_category || "NULL"}`);
    console.log(`   Department: ${job.standardized_department || "NULL"}`);
    console.log(`   Location: ${job.location || "NULL"}`);
  });

  // Overall assessment
  console.log("\n" + "═".repeat(70));
  const criticalFieldsComplete =
    withDescription === jobs.length &&
    withSummary === jobs.length &&
    withSeniority === jobs.length &&
    withFunctionCategory === jobs.length;

  if (criticalFieldsComplete) {
    console.log("✅ SUCCESS: All critical job details are populated!");
    console.log("   - All jobs have descriptions");
    console.log("   - All jobs have summaries");
    console.log("   - All jobs have seniority levels");
    console.log("   - All jobs have function categories");
    if (withLocation < jobs.length) {
      console.log(`\n⚠️  Note: ${jobs.length - withLocation} jobs are missing location information`);
      console.log("   This is likely because job descriptions don't contain location data.");
    }
  } else {
    console.log("⚠️  WARNING: Some jobs are missing critical fields");
    if (withDescription < jobs.length) console.log(`   - ${jobs.length - withDescription} jobs missing descriptions`);
    if (withSummary < jobs.length) console.log(`   - ${jobs.length - withSummary} jobs missing summaries`);
    if (withSeniority < jobs.length) console.log(`   - ${jobs.length - withSeniority} jobs missing seniority`);
    if (withFunctionCategory < jobs.length)
      console.log(`   - ${jobs.length - withFunctionCategory} jobs missing function category`);
  }
}

main().catch(console.error);
