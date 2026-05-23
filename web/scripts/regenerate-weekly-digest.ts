/**
 * Regenerate Weekly Digest Script
 * 
 * This script regenerates the weekly digest with improved prompts.
 * It will:
 * 1. Delete the most recent digest (optionally)
 * 2. Generate a fresh digest using the updated LLM prompts
 * 3. Save to database
 * 
 * Run with: npx tsx --env-file=.env.local scripts/regenerate-weekly-digest.ts
 * 
 * Options:
 *   --delete-existing  Delete the most recent digest before regenerating
 *   --dry-run         Generate but don't save to database
 */

import { createClient } from "@supabase/supabase-js";
import { getWeeklyData, generateWeeklyReport } from "../lib/analysis/digest";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const args = process.argv.slice(2);
const deleteExisting = args.includes("--delete-existing");
const dryRun = args.includes("--dry-run");

async function regenerateDigest() {
  console.log("=== Weekly Digest Regeneration ===\n");
  console.log(`Options: deleteExisting=${deleteExisting}, dryRun=${dryRun}\n`);

  // Step 1: Optionally delete the most recent digest
  if (deleteExisting && !dryRun) {
    console.log("Fetching most recent digest...");
    const { data: latestDigest, error: fetchError } = await supabase
      .from("weekly_digests")
      .select("id, week_start, week_end")
      .order("week_start", { ascending: false })
      .limit(1)
      .single();

    if (fetchError) {
      console.log("No existing digest found or error:", fetchError.message);
    } else if (latestDigest) {
      console.log(`Found digest: ${latestDigest.week_start} to ${latestDigest.week_end}`);
      console.log("Deleting associated company summaries...");
      
      await supabase
        .from("weekly_digest_companies")
        .delete()
        .eq("digest_id", latestDigest.id);

      console.log("Deleting digest...");
      await supabase
        .from("weekly_digests")
        .delete()
        .eq("id", latestDigest.id);

      console.log("Deleted successfully.\n");
    }
  }

  // Step 2: Fetch weekly data
  console.log("Fetching job data for the past 7 days...");
  const weeklyData = await getWeeklyData(7);
  console.log(`Found ${weeklyData.size} companies with new jobs\n`);

  if (weeklyData.size === 0) {
    console.log("No job data found. Exiting.");
    return;
  }

  // Step 3: Generate the digest
  console.log("Generating weekly digest with improved prompts...");
  console.log("(This may take a few minutes due to AI processing)\n");
  
  const digest = await generateWeeklyReport(weeklyData, 2); // Use 2 parallel requests to be safe

  // Step 4: Display results
  console.log("\n=== Generated Digest ===\n");
  console.log(`Week: ${digest.week_start} to ${digest.week_end}`);
  console.log(`Total Jobs: ${digest.total_jobs}`);
  console.log(`Total Companies: ${digest.total_companies}`);
  
  if (digest.global_summary) {
    console.log(`\nGlobal Summary:`);
    console.log(`  Headline: ${digest.global_summary.headline}`);
    console.log(`  Key Insight: ${digest.global_summary.key_insight}`);
  }

  console.log(`\n=== Company Headlines ===\n`);
  for (const company of digest.companies) {
    console.log(`${company.company_name}:`);
    console.log(`  Headline: ${company.ai_commentary.headline}`);
    console.log(`  Body: ${company.ai_commentary.body.substring(0, 100)}...`);
    console.log();
  }

  // Step 5: Save to database (unless dry run)
  if (dryRun) {
    console.log("\n[DRY RUN] Digest not saved to database.");
    return;
  }

  console.log("\nSaving digest to database...");
  
  // Insert main digest
  const { data: digestRecord, error: digestError } = await supabase
    .from("weekly_digests")
    .insert({
      week_start: digest.week_start,
      week_end: digest.week_end,
      generated_at: digest.generated_at,
      total_jobs: digest.total_jobs,
      total_companies: digest.total_companies,
      global_summary: digest.global_summary,
      industry_trends: digest.industry_trends,
      strategy_signals: digest.strategy_signals,
      notable_movements: digest.notable_movements,
      incumbent_watch: digest.incumbent_watch,
      email_sent: false,
    })
    .select("id")
    .single();

  if (digestError) {
    // Handle duplicate week - update instead
    if (digestError.code === "23505") {
      console.log("Digest for this week already exists, updating...");
      
      const { data: existing } = await supabase
        .from("weekly_digests")
        .select("id")
        .eq("week_start", digest.week_start)
        .single();

      if (existing) {
        await supabase
          .from("weekly_digests")
          .update({
            generated_at: digest.generated_at,
            total_jobs: digest.total_jobs,
            total_companies: digest.total_companies,
            global_summary: digest.global_summary,
            industry_trends: digest.industry_trends,
            strategy_signals: digest.strategy_signals,
            notable_movements: digest.notable_movements,
            incumbent_watch: digest.incumbent_watch,
          })
          .eq("id", existing.id);

        // Delete old company summaries
        await supabase
          .from("weekly_digest_companies")
          .delete()
          .eq("digest_id", existing.id);

        // Insert new company summaries
        const companySummaries = digest.companies.map(company => ({
          digest_id: existing.id,
          company_id: company.company_id,
          new_job_count: company.new_job_count,
          departments: company.departments,
          dominant_tech: company.dominant_tech,
          seniority_breakdown: company.seniority_breakdown,
          headline: company.ai_commentary.headline,
          body: company.ai_commentary.body,
        }));

        await supabase
          .from("weekly_digest_companies")
          .insert(companySummaries);

        console.log(`Updated existing digest: ${existing.id}`);
      }
    } else {
      console.error("Error saving digest:", digestError);
      return;
    }
  } else if (digestRecord) {
    // Insert company summaries
    const companySummaries = digest.companies.map(company => ({
      digest_id: digestRecord.id,
      company_id: company.company_id,
      new_job_count: company.new_job_count,
      departments: company.departments,
      dominant_tech: company.dominant_tech,
      seniority_breakdown: company.seniority_breakdown,
      headline: company.ai_commentary.headline,
      body: company.ai_commentary.body,
    }));

    const { error: companiesError } = await supabase
      .from("weekly_digest_companies")
      .insert(companySummaries);

    if (companiesError) {
      console.error("Error saving company summaries:", companiesError);
    } else {
      console.log(`Saved new digest: ${digestRecord.id}`);
    }
  }

  console.log("\n=== Done! ===");
  console.log("Visit /digests to see the new digest.");
}

regenerateDigest().catch(console.error);
