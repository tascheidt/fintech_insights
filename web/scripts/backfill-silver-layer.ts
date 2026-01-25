#!/usr/bin/env npx tsx
/**
 * Backfill Silver Layer Data
 * 
 * Extracts and populates Silver Layer structured data for existing jobs
 * that don't have it yet. Uses the existing extractJobStructure function.
 * 
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/backfill-silver-layer.ts
 *   # Or with limit:
 *   npx tsx --env-file=.env.local web/scripts/backfill-silver-layer.ts --limit=50
 */

import { createAdminClient } from "../lib/supabase/admin";
import { extractJobStructure, normalizeJobTitle, isValidDepartment, isValidLocation } from "../lib/analysis/structure";

async function main() {
  const supabase = createAdminClient();

  // Parse command line arguments
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  console.log("🔄 Backfilling Silver Layer Data\n");
  console.log("═".repeat(70));

  // Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY environment variable is not set");
    console.log("\nTo set it:");
    console.log("  1. Add GEMINI_API_KEY=your-key to .env.local in the web directory");
    console.log("  2. Or export GEMINI_API_KEY=your-key before running");
    process.exit(1);
  }

  // Find jobs that need Silver Layer data
  // Jobs where tech_stack is null or empty array
  let query = supabase
    .from("job_postings")
    .select("id, title, description_text")
    .or("tech_stack.is.null,tech_stack.eq.[]")
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
    console.log("✅ No jobs need backfilling - all jobs already have Silver Layer data!");
    return;
  }

  console.log(`📋 Found ${jobs.length} job(s) that need Silver Layer data\n`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ id: string; title: string; error: string }> = [];

  // Process each job
  for (const job of jobs) {
    processed++;
    const progress = `[${processed}/${jobs.length}]`;

    console.log(`${progress} Processing: ${job.title}`);

    try {
      // Fetch raw department and location for context
      const { data: jobWithFields } = await supabase
        .from("job_postings")
        .select("department, location")
        .eq("id", job.id)
        .single();

      // Use the existing extractJobStructure function (pass raw department)
      // Location will be extracted from description by AI
      const structure = await extractJobStructure(
        job.title,
        job.description_text || "",
        jobWithFields?.department
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
      const cleanedDepartment = jobWithFields && isValidDepartment(jobWithFields.department)
        ? jobWithFields.department
        : null;

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
      const cleanedLocation = jobWithFields && isValidLocation(jobWithFields.location) ? jobWithFields.location : null;
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

      console.log(`  ✅ Extracted: ${structure.seniority_level}, ${structure.tech_stack.length} techs, ${structure.standardized_department}`);
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
