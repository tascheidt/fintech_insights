#!/usr/bin/env npx tsx
/**
 * Backfill Recent Jobs - Department, Location, and Function Category
 * 
 * Extracts and populates department, location, and function_category fields
 * for recently scraped jobs that are missing these fields. Uses the same
 * extraction logic as the ingestion pipeline.
 * 
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/backfill-recent-jobs-fields.ts
 *   # Or with custom days:
 *   npx tsx --env-file=.env.local web/scripts/backfill-recent-jobs-fields.ts --days=7
 *   # Or with limit:
 *   npx tsx --env-file=.env.local web/scripts/backfill-recent-jobs-fields.ts --limit=50
 */

import { createAdminClient } from "../lib/supabase/admin";
import { extractJobStructure, normalizeJobTitle, isValidDepartment, isValidLocation } from "../lib/analysis/structure";

async function main() {
  const supabase = createAdminClient();

  // Parse command line arguments
  const daysArg = process.argv.find((arg) => arg.startsWith("--days="));
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  
  const days = daysArg ? parseInt(daysArg.split("=")[1], 10) : 7; // Default: last 7 days
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  console.log("🔄 Backfilling Recent Jobs - Department, Location, Function Category\n");
  console.log("═".repeat(70));

  // Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY environment variable is not set");
    console.log("\nTo set it:");
    console.log("  1. Add GEMINI_API_KEY=your-key to .env.local in the web directory");
    console.log("  2. Or export GEMINI_API_KEY=your-key before running");
    process.exit(1);
  }

  // Calculate date threshold (days ago)
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);
  const dateThresholdISO = dateThreshold.toISOString();

  console.log(`📅 Looking for jobs scraped in the last ${days} days (since ${dateThresholdISO.split('T')[0]})\n`);

  // Find recent jobs missing department, location, or function_category
  // Jobs must have description_text to extract from
  let query = supabase
    .from("job_postings")
    .select("id, title, description_text, department, location, function_category, first_seen_date")
    .gte("first_seen_date", dateThresholdISO)
    .not("description_text", "is", null)
    .neq("description_text", "")
    .or("department.is.null,location.is.null,function_category.is.null")
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
    console.log("✅ No recent jobs need backfilling - all fields are populated!");
    return;
  }

  // Filter to jobs that actually need updating
  const jobsToProcess = jobs.filter((job) => {
    const needsDept = !job.department || !isValidDepartment(job.department);
    const needsLocation = !job.location || !isValidLocation(job.location);
    const needsFunction = !job.function_category;
    return needsDept || needsLocation || needsFunction;
  });

  if (jobsToProcess.length === 0) {
    console.log("✅ No jobs need backfilling - all fields are populated!");
    return;
  }

  console.log(`📋 Found ${jobsToProcess.length} job(s) that need field population\n`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ id: string; title: string; error: string }> = [];
  const updates: {
    department: number;
    location: number;
    function_category: number;
  } = {
    department: 0,
    location: 0,
    function_category: 0,
  };

  // Process each job
  for (const job of jobsToProcess) {
    processed++;
    const progress = `[${processed}/${jobsToProcess.length}]`;

    const needsDept = !job.department || !isValidDepartment(job.department);
    const needsLocation = !job.location || !isValidLocation(job.location);
    const needsFunction = !job.function_category;

    console.log(`${progress} Processing: ${job.title}`);
    if (needsDept) console.log(`  ⚠️  Missing/invalid department`);
    if (needsLocation) console.log(`  ⚠️  Missing/invalid location`);
    if (needsFunction) console.log(`  ⚠️  Missing function_category`);

    try {
      // Extract structured data (pass raw department as context)
      // Location will be extracted from description by AI
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

      // Validate and clean department field - set to null if invalid
      const cleanedDepartment = isValidDepartment(job.department) ? job.department : null;
      const departmentUpdated = needsDept && cleanedDepartment !== null;

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
      const locationUpdated = needsLocation && finalLocation !== null;

      // Track if function_category was updated
      const functionUpdated = needsFunction && structure.function_category !== null;

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

      // Track what was updated
      const updatedFields: string[] = [];
      if (departmentUpdated) {
        updates.department++;
        updatedFields.push("department");
      }
      if (locationUpdated) {
        updates.location++;
        updatedFields.push("location");
      }
      if (functionUpdated) {
        updates.function_category++;
        updatedFields.push("function_category");
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
  console.log(`    - Department: ${updates.department}`);
  console.log(`    - Location: ${updates.location}`);
  console.log(`    - Function Category: ${updates.function_category}`);

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
