#!/usr/bin/env npx tsx
/**
 * Backfill Questrade LLM Fields
 * 
 * Re-runs LLM extraction for Questrade jobs that have descriptions but are missing
 * summary, seniority_level, tech_stack, location, or standardized_department.
 * 
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/backfill-questrade-llm-fields.ts
 */

import { createAdminClient } from "../lib/supabase/admin";
import { extractJobStructure, normalizeJobTitle, isValidDepartment, isValidLocation } from "../lib/analysis/structure";

async function main() {
  console.log("🔄 Backfilling Questrade LLM Fields\n");
  console.log("═".repeat(70));

  const supabase = createAdminClient();

  // Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY environment variable is not set");
    process.exit(1);
  }

  // Get Questrade company (use hardcoded ID to match verification script)
  const companyId = "4a99a35d-9794-4eaf-a3df-c37162fdceef";
  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .single();

  if (!company) {
    console.error("❌ Questrade company not found");
    process.exit(1);
  }

  console.log(`📋 Company: ${company.name} (ID: ${company.id})\n`);

  // Find Questrade jobs with descriptions but missing LLM fields
  // Check for jobs missing ANY of: summary, seniority_level, tech_stack, location, standardized_department
  const { data: jobs, error } = await supabase
    .from("job_postings")
    .select("id, title, description_text, department, location, summary, seniority_level, tech_stack, function_category, location_structured, standardized_department")
    .eq("company_id", companyId)
    .not("description_text", "is", null)
    .order("last_seen_date", { ascending: false })
    .limit(50);

  if (error) {
    console.error("❌ Error fetching jobs:", error);
    process.exit(1);
  }

  if (error) {
    console.error("❌ Error fetching jobs:", error);
    process.exit(1);
  }

  if (!jobs || jobs.length === 0) {
    console.log("✅ No jobs found");
    return;
  }

  console.log(`📋 Found ${jobs.length} total job(s) with descriptions\n`);

  // Filter to jobs that actually need updating
  const jobsToProcess = jobs.filter((job) => {
    const needsSummary = !job.summary;
    const needsSeniority = !job.seniority_level;
    const needsTechStack = !job.tech_stack || (Array.isArray(job.tech_stack) && job.tech_stack.length === 0);
    const needsLocation = !job.location;
    const needsStandardizedDept = !job.standardized_department;
    return needsSummary || needsSeniority || needsTechStack || needsLocation || needsStandardizedDept;
  });

  if (jobsToProcess.length === 0) {
    console.log("✅ No jobs need backfilling - all LLM fields are populated!");
    return;
  }

  console.log(`📋 Found ${jobsToProcess.length} job(s) that need LLM field population\n`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ id: string; title: string; error: string }> = [];
  const updates: {
    summary: number;
    seniority_level: number;
    tech_stack: number;
    location: number;
    standardized_department: number;
  } = {
    summary: 0,
    seniority_level: 0,
    tech_stack: 0,
    location: 0,
    standardized_department: 0,
  };

  // Process each job
  for (const job of jobsToProcess) {
    processed++;
    const progress = `[${processed}/${jobsToProcess.length}]`;

    const needsSummary = !job.summary;
    const needsSeniority = !job.seniority_level;
    const needsTechStack = !job.tech_stack || (Array.isArray(job.tech_stack) && job.tech_stack.length === 0);
    const needsLocation = !job.location;
    const needsStandardizedDept = !job.standardized_department;

    console.log(`${progress} Processing: ${job.title}`);
    if (needsSummary) console.log(`  ⚠️  Missing summary`);
    if (needsSeniority) console.log(`  ⚠️  Missing seniority_level`);
    if (needsTechStack) console.log(`  ⚠️  Missing tech_stack`);
    if (needsLocation) console.log(`  ⚠️  Missing location`);
    if (needsStandardizedDept) console.log(`  ⚠️  Missing standardized_department`);

    try {
      // Extract structured data
      const structure = await extractJobStructure(
        job.title,
        job.description_text || "",
        job.department || undefined
      );

      if (!structure) {
        console.log(`  ⚠️  Extraction returned null, skipping...`);
        failed++;
        errors.push({
          id: job.id,
          title: job.title,
          error: "Extraction returned null",
        });
        continue;
      }

      // Normalize title
      const normalizedTitle = normalizeJobTitle(job.title);

      // Validate and clean department field
      const cleanedDepartment = isValidDepartment(job.department) ? job.department : null;

      // Handle location
      const locationStructured = structure.location_structured;
      let formattedLocation: string | null = null;
      if (locationStructured?.formatted) {
        formattedLocation = locationStructured.formatted;
      } else if (locationStructured) {
        const parts: string[] = [];
        if (locationStructured.city) parts.push(locationStructured.city);
        if (locationStructured.state) parts.push(locationStructured.state);
        if (locationStructured.country) parts.push(locationStructured.country);
        formattedLocation = parts.length > 0 ? parts.join(', ') : null;
      }
      const cleanedLocation = isValidLocation(job.location) ? job.location : null;
      const finalLocation = formattedLocation || cleanedLocation || null;

      // Track what was updated
      const updatedFields: string[] = [];
      if (needsSummary && structure.summary) {
        updates.summary++;
        updatedFields.push("summary");
      }
      if (needsSeniority && structure.seniority_level) {
        updates.seniority_level++;
        updatedFields.push("seniority_level");
      }
      if (needsTechStack && structure.tech_stack && structure.tech_stack.length > 0) {
        updates.tech_stack++;
        updatedFields.push("tech_stack");
      }
      if (needsLocation && finalLocation) {
        updates.location++;
        updatedFields.push("location");
      }
      if (needsStandardizedDept && structure.standardized_department) {
        updates.standardized_department++;
        updatedFields.push("standardized_department");
      }

      // Update the job with extracted structure
      const { error: updateError } = await supabase
        .from("job_postings")
        .update({
          summary: structure.summary,
          seniority_level: structure.seniority_level,
          salary_min: structure.salary_min,
          salary_max: structure.salary_max,
          salary_currency: structure.salary_currency,
          tech_stack: structure.tech_stack,
          keywords: structure.keywords || [],
          standardized_department: structure.standardized_department,
          function_category: structure.function_category,
          normalized_title: normalizedTitle,
          department: cleanedDepartment,
          location_structured: locationStructured,
          location: finalLocation,
        })
        .eq("id", job.id);

      if (updateError) {
        console.log(`  ❌ Database update failed: ${updateError.message}`);
        failed++;
        errors.push({
          id: job.id,
          title: job.title,
          error: updateError.message,
        });
        continue;
      }

      console.log(`  ✅ Updated: ${updatedFields.join(", ") || "all fields"}`);
      succeeded++;

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ Error: ${errorMessage}`);
      failed++;
      errors.push({
        id: job.id,
        title: job.title,
        error: errorMessage,
      });
    }
  }

  // Summary
  console.log("\n" + "═".repeat(70));
  console.log("📊 Backfill Summary:");
  console.log("═".repeat(70));
  console.log(`  Total processed: ${processed}`);
  console.log(`  ✅ Succeeded: ${succeeded}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`\n  Fields updated:`);
  console.log(`    - Summary: ${updates.summary}`);
  console.log(`    - Seniority Level: ${updates.seniority_level}`);
  console.log(`    - Tech Stack: ${updates.tech_stack}`);
  console.log(`    - Location: ${updates.location}`);
  console.log(`    - Standardized Department: ${updates.standardized_department}`);

  if (errors.length > 0) {
    console.log("\n⚠️  Errors:");
    errors.slice(0, 10).forEach((err) => {
      console.log(`  - ${err.title}: ${err.error}`);
    });
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more`);
    }
  }

  console.log("\n✅ Backfill complete!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
