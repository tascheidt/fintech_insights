#!/usr/bin/env npx tsx
/**
 * Backfill Location Cleanup and Re-processing
 * 
 * Re-processes jobs with invalid location values (placeholder text like "Search by Location") to:
 * 1. Extract structured location from descriptions using AI
 * 2. Clean invalid location values (set to null)
 * 3. Update location_structured JSONB field
 * 4. Generate formatted location string from structured data
 * 
 * Usage:
 *   # From project root:
 *   npx tsx --env-file=web/.env.local web/scripts/backfill-location-cleanup.ts
 *   # Or from web directory:
 *   npx tsx --env-file=.env.local scripts/backfill-location-cleanup.ts
 *   
 *   # With options:
 *   npx tsx --env-file=web/.env.local web/scripts/backfill-location-cleanup.ts --limit=50
 *   npx tsx --env-file=web/.env.local web/scripts/backfill-location-cleanup.ts --invalid-only
 */

import { createAdminClient } from "../lib/supabase/admin";
import { extractJobStructure, normalizeJobTitle, isValidLocation } from "../lib/analysis/structure";

async function main() {
  const supabase = createAdminClient();

  // Parse command line arguments
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;
  const invalidOnly = process.argv.includes("--invalid-only");

  console.log("🔄 Backfilling Location Cleanup and Re-processing\n");
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
    .select("id, title, description_text, location, location_structured")
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
    jobsToProcess = jobs.filter((job) => !isValidLocation(job.location));
    console.log(`📋 Found ${jobsToProcess.length} job(s) with invalid location values\n`);
  } else {
    // Process all jobs that either:
    // 1. Have invalid location values, OR
    // 2. Missing location_structured
    jobsToProcess = jobs.filter(
      (job) =>
        !isValidLocation(job.location) ||
        !job.location_structured
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
    const hasInvalidLocation = !isValidLocation(job.location);
    const needsLocationStructured = !job.location_structured;

    console.log(`${progress} Processing: ${job.title}`);
    if (hasInvalidLocation) {
      console.log(`  ⚠️  Invalid location: "${job.location}"`);
    }
    if (needsLocationStructured) {
      console.log(`  ⚠️  Missing location_structured`);
    }

    try {
      // Extract structured data (always extract location from description)
      const structure = await extractJobStructure(
        job.title,
        job.description_text || "",
        undefined // No raw department needed for location extraction
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
      
      if (hasInvalidLocation && finalLocation !== job.location) {
        cleaned++;
      }

      // Update the job with extracted location structure
      const { error: updateError } = await supabase
        .from("job_postings")
        .update({
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
      if (hasInvalidLocation && finalLocation !== job.location) {
        updates.push(`cleaned location: "${job.location}" -> ${finalLocation ? `"${finalLocation}"` : "null"}`);
      }
      if (needsLocationStructured && locationStructured) {
        const locParts: string[] = [];
        if (locationStructured.city) locParts.push(locationStructured.city);
        if (locationStructured.state) locParts.push(locationStructured.state);
        if (locationStructured.country) locParts.push(locationStructured.country);
        updates.push(`added location_structured: ${locParts.join(', ') || 'null'}`);
      }

      console.log(
        `  ✅ ${updates.length > 0 ? updates.join(", ") : "Updated"}`
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
  console.log(`  🧹 Location values cleaned: ${cleaned}`);

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
