#!/usr/bin/env npx tsx
/**
 * Backfill Department Cleanup and Re-processing
 * 
 * Re-processes jobs with invalid department values (cookie/privacy text) to:
 * 1. Clean invalid department values (set to null)
 * 2. Extract keywords (if missing)
 * 3. Update standardized_department
 * 
 * Usage:
 *   # From project root:
 *   npx tsx --env-file=.env.local web/scripts/backfill-department-cleanup.ts
 *   # Or from web directory:
 *   npx tsx --env-file=.env.local scripts/backfill-department-cleanup.ts
 *   
 *   # With options:
 *   npx tsx --env-file=.env.local web/scripts/backfill-department-cleanup.ts --limit=50
 *   npx tsx --env-file=.env.local web/scripts/backfill-department-cleanup.ts --invalid-only
 */

import { createAdminClient } from "../lib/supabase/admin";
import { extractJobStructure, normalizeJobTitle, isValidDepartment, isValidLocation } from "../lib/analysis/structure";

async function main() {
  const supabase = createAdminClient();

  // Parse command line arguments
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;
  const invalidOnly = process.argv.includes("--invalid-only");

  console.log("🔄 Backfilling Department Cleanup and Re-processing\n");
  console.log("═".repeat(70));

  // Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY environment variable is not set");
    console.log("\nTo set it:");
    console.log("  1. Add GEMINI_API_KEY=your-key to .env.local in the web directory");
    console.log("  2. Or export GEMINI_API_KEY=your-key before running");
    process.exit(1);
  }

  // Find jobs that need processing
  let query = supabase
    .from("job_postings")
    .select("id, title, description_text, department, location, keywords, standardized_department, location_structured")
    .not("description_text", "is", null)
    .neq("description_text", "")
    .order("first_seen_date", { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data: jobs, error: fetchError } = await query;

  if (fetchError) {
    console.error("❌ Error fetching jobs:", fetchError);
    process.exit(1);
  }

  if (!jobs || jobs.length === 0) {
    console.log("✅ No jobs found!");
    return;
  }

  // Filter jobs that need processing
  let jobsToProcess = jobs;
  if (invalidOnly) {
    jobsToProcess = jobs.filter((job) => !isValidDepartment(job.department));
    console.log(`📋 Found ${jobsToProcess.length} job(s) with invalid department values\n`);
  } else {
    // Process all jobs that either:
    // 1. Have invalid department values, OR
    // 2. Missing keywords, OR
    // 3. Missing standardized_department
    jobsToProcess = jobs.filter(
      (job) =>
        !isValidDepartment(job.department) ||
        !job.keywords ||
        (Array.isArray(job.keywords) && job.keywords.length === 0) ||
        !job.standardized_department
    );
    console.log(`📋 Found ${jobsToProcess.length} job(s) that need processing\n`);
  }

  if (jobsToProcess.length === 0) {
    console.log("✅ No jobs need processing - all jobs are clean!");
    return;
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let cleaned = 0;
  const errors: Array<{ id: string; title: string; error: string }> = [];

  // Process each job
  for (const job of jobsToProcess) {
    processed++;
    const progress = `[${processed}/${jobsToProcess.length}]`;
    const hasInvalidDept = !isValidDepartment(job.department);
    const needsKeywords = !job.keywords || (Array.isArray(job.keywords) && job.keywords.length === 0);
    const needsStandardizedDept = !job.standardized_department;

    console.log(`${progress} Processing: ${job.title}`);
    if (hasInvalidDept) {
      console.log(`  ⚠️  Invalid department: "${job.department}"`);
    }
    if (needsKeywords) {
      console.log(`  ⚠️  Missing keywords`);
    }
    if (needsStandardizedDept) {
      console.log(`  ⚠️  Missing standardized_department`);
    }

    try {
      // Extract structured data (pass raw department as context)
      const structure = await extractJobStructure(
        job.title,
        job.description_text || "",
        job.department
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

      // Normalize title using existing function
      const normalizedTitle = normalizeJobTitle(job.title);

      // Validate and clean department field - set to null if invalid
      const cleanedDepartment = isValidDepartment(job.department) ? job.department : null;
      if (hasInvalidDept && cleanedDepartment === null) {
        cleaned++;
      }

      // Handle location: use AI-extracted structured location
      const locationStructured = structure.location_structured;
      
      // Generate formatted location string from structured data
      let formattedLocation: string | null = null;
      if (locationStructured?.formatted) {
        formattedLocation = locationStructured.formatted;
      } else if (locationStructured) {
        // Generate formatted string from components
        const parts: string[] = [];
        if (locationStructured.city) parts.push(locationStructured.city);
        if (locationStructured.state) parts.push(locationStructured.state);
        if (locationStructured.country) parts.push(locationStructured.country);
        formattedLocation = parts.length > 0 ? parts.join(', ') : null;
      }
      
      // Validate scraper-provided location - if invalid, use AI-extracted or null
      const cleanedLocation = isValidLocation(job.location) ? job.location : null;
      const finalLocation = formattedLocation || cleanedLocation || null;

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
          normalized_title: normalizedTitle,
          // Clean invalid department values (set to null)
          department: cleanedDepartment,
          // Store structured location and update formatted location
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

      const updates: string[] = [];
      if (hasInvalidDept && cleanedDepartment === null) {
        updates.push("cleaned department");
      }
      if (needsKeywords && structure.keywords && structure.keywords.length > 0) {
        updates.push(`added ${structure.keywords.length} keywords`);
      }
      if (needsStandardizedDept && structure.standardized_department) {
        updates.push(`set standardized_department: ${structure.standardized_department}`);
      }

      console.log(
        `  ✅ ${updates.length > 0 ? updates.join(", ") : "Updated"} | ${structure.seniority_level}, ${structure.tech_stack.length} techs`
      );
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
  console.log(`  🧹 Department values cleaned: ${cleaned}`);

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
