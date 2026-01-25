#!/usr/bin/env npx tsx
/**
 * Verify Questrade Jobs After Scraping
 * 
 * Checks that Questrade jobs scraped via GitHub Actions have:
 * - Descriptions populated
 * - Department, location, function_category fields populated
 * - LLM extraction completed successfully
 * 
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/verify-questrade-jobs.ts
 */

import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  console.log("🔍 Verifying Questrade Jobs After Scraping\n");
  console.log("═".repeat(70));

  const supabase = createAdminClient();

  // Get Questrade company ID
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("slug", "questrade")
    .single();

  if (companyError || !company) {
    console.error("❌ Error fetching Questrade company:", companyError);
    process.exit(1);
  }

  console.log(`📋 Company: ${company.name} (${company.slug})`);
  console.log(`   ID: ${company.id}\n`);

  // Get recent Questrade jobs (last 24 hours)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const { data: jobs, error: jobsError } = await supabase
    .from("job_postings")
    .select(`
      id,
      title,
      description_text,
      description_html,
      department,
      location,
      function_category,
      standardized_department,
      location_structured,
      summary,
      seniority_level,
      tech_stack,
      keywords,
      last_seen_date,
      first_seen_date
    `)
    .eq("company_id", company.id)
    .gte("last_seen_date", yesterday.toISOString())
    .order("last_seen_date", { ascending: false });

  if (jobsError) {
    console.error("❌ Error fetching jobs:", jobsError);
    process.exit(1);
  }

  if (!jobs || jobs.length === 0) {
    console.log("⚠️  No recent jobs found (last 24 hours)");
    console.log("   Checking all active jobs instead...\n");

    const { data: allJobs } = await supabase
      .from("job_postings")
      .select(`
        id,
        title,
        description_text,
        description_html,
        department,
        location,
        function_category,
        standardized_department,
        location_structured,
        summary,
        seniority_level,
        tech_stack,
        keywords,
        last_seen_date,
        first_seen_date
      `)
      .eq("company_id", company.id)
      .eq("is_active", true)
      .order("last_seen_date", { ascending: false })
      .limit(30);

    if (!allJobs || allJobs.length === 0) {
      console.log("❌ No active jobs found for Questrade");
      return;
    }

    console.log(`📊 Found ${allJobs.length} active job(s)\n`);
    analyzeJobs(allJobs);
  } else {
    console.log(`📊 Found ${jobs.length} recently updated job(s)\n`);
    analyzeJobs(jobs);
  }

  function analyzeJobs(jobsToAnalyze: any[]) {
    const sampleSize = Math.min(10, jobsToAnalyze.length);
    console.log(`📊 Analyzing ${sampleSize} job(s):\n`);

    let jobsWithDescriptions = 0;
    let jobsWithLocations = 0;
    let jobsWithDepartments = 0;
    let jobsWithFunctionCategory = 0;
    let jobsWithLLMFields = 0;

    const issues: Array<{ title: string; issues: string[] }> = [];

    for (let i = 0; i < sampleSize; i++) {
      const job = jobsToAnalyze[i];
      const jobIssues: string[] = [];

      console.log(`${i + 1}. ${job.title}`);
      console.log(`   ID: ${job.id}`);

      // Check description
      const hasDescription = !!(job.description_html || job.description_text);
      if (hasDescription) {
        jobsWithDescriptions++;
        const descLength = (job.description_text || job.description_html || "").length;
        console.log(`   ✅ Description: ${descLength} chars`);
      } else {
        jobIssues.push("Missing description");
        console.log(`   ❌ Description: MISSING`);
      }

      // Check location
      if (job.location) {
        jobsWithLocations++;
        console.log(`   ✅ Location: ${job.location}`);
      } else {
        jobIssues.push("Missing location");
        console.log(`   ⚠️  Location: missing`);
      }

      // Check department
      if (job.department) {
        jobsWithDepartments++;
        console.log(`   ✅ Department: ${job.department}`);
      } else {
        console.log(`   ⚠️  Department: missing (may be null if invalid)`);
      }

      // Check function_category
      if (job.function_category) {
        jobsWithFunctionCategory++;
        console.log(`   ✅ Function Category: ${job.function_category}`);
      } else {
        jobIssues.push("Missing function_category");
        console.log(`   ❌ Function Category: MISSING`);
      }

      // Check standardized_department
      if (job.standardized_department) {
        console.log(`   ✅ Standardized Department: ${job.standardized_department}`);
      } else {
        console.log(`   ⚠️  Standardized Department: missing`);
      }

      // Check LLM-extracted fields (check for actual content, not just existence)
      const hasSummary = !!(job.summary && job.summary.trim().length > 0);
      const hasSeniority = !!job.seniority_level;
      const hasTechStack = !!(job.tech_stack && Array.isArray(job.tech_stack) && job.tech_stack.length > 0);
      const hasLLMFields = hasSummary || hasSeniority || hasTechStack;
      
      if (hasLLMFields) {
        jobsWithLLMFields++;
        const llmParts: string[] = [];
        if (hasSummary) llmParts.push(`summary (${job.summary.length} chars)`);
        if (hasSeniority) llmParts.push(`seniority=${job.seniority_level}`);
        if (hasTechStack) llmParts.push(`tech_stack=${job.tech_stack.length} items`);
        console.log(`   ✅ LLM Fields: ${llmParts.join(", ")}`);
      } else {
        // function_category is also an LLM field, so if it exists, extraction ran but other fields missing
        if (job.function_category) {
          console.log(`   ⚠️  LLM Fields: Partial (function_category exists, but summary/seniority/tech_stack missing)`);
          jobIssues.push("Missing some LLM-extracted fields (summary, seniority, tech_stack)");
        } else {
          jobIssues.push("Missing LLM-extracted fields");
          console.log(`   ❌ LLM Fields: MISSING (summary=${hasSummary}, seniority=${hasSeniority}, tech_stack=${hasTechStack})`);
        }
      }

      if (jobIssues.length > 0) {
        issues.push({ title: job.title, issues: jobIssues });
      }

      console.log();
    }

    // Summary
    console.log("═".repeat(70));
    console.log("📊 Summary:");
    console.log("═".repeat(70));
    console.log(`  Total analyzed: ${sampleSize}`);
    console.log(`  Jobs with descriptions: ${jobsWithDescriptions}/${sampleSize} (${Math.round(jobsWithDescriptions/sampleSize*100)}%)`);
    console.log(`  Jobs with locations: ${jobsWithLocations}/${sampleSize} (${Math.round(jobsWithLocations/sampleSize*100)}%)`);
    console.log(`  Jobs with departments: ${jobsWithDepartments}/${sampleSize} (${Math.round(jobsWithDepartments/sampleSize*100)}%)`);
    console.log(`  Jobs with function_category: ${jobsWithFunctionCategory}/${sampleSize} (${Math.round(jobsWithFunctionCategory/sampleSize*100)}%)`);
    console.log(`  Jobs with LLM fields: ${jobsWithLLMFields}/${sampleSize} (${Math.round(jobsWithLLMFields/sampleSize*100)}%)`);

    if (issues.length > 0) {
      console.log("\n⚠️  Jobs with issues:");
      issues.forEach(({ title, issues: jobIssues }) => {
        console.log(`  - ${title}: ${jobIssues.join(", ")}`);
      });
    }

    // Overall assessment
    console.log("\n" + "═".repeat(70));
    if (jobsWithDescriptions === sampleSize && jobsWithFunctionCategory === sampleSize && jobsWithLLMFields === sampleSize) {
      console.log("✅ SUCCESS: All jobs have descriptions and LLM fields populated!");
      console.log("   Questrade scraping and LLM processing is working correctly.");
    } else if (jobsWithDescriptions === 0) {
      console.log("❌ CRITICAL: No jobs have descriptions!");
      console.log("   This indicates the scraper is not fetching job detail pages.");
    } else if (jobsWithFunctionCategory === 0 || jobsWithLLMFields === 0) {
      console.log("⚠️  WARNING: LLM extraction may not have completed yet.");
      console.log("   Check if extraction promises are being awaited properly.");
    } else {
      console.log("⚠️  PARTIAL: Some jobs are missing fields.");
      console.log("   This might be normal if some jobs don't have complete data.");
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
