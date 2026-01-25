/**
 * Backfill Function Category
 * 
 * Extracts and stores function_category for existing jobs using AI (categorizePosting).
 * Processes jobs in batches with test mode support.
 * 
 * Usage:
 *   # Test with 10 jobs first
 *   npx tsx --env-file=.env.local web/scripts/backfill-function-category.ts --test=10
 *   
 *   # Process all jobs (after testing)
 *   npx tsx --env-file=.env.local web/scripts/backfill-function-category.ts
 *   
 *   # Process specific number
 *   npx tsx --env-file=.env.local web/scripts/backfill-function-category.ts --limit=100
 *   
 *   # Process only jobs missing function_category
 *   npx tsx --env-file=.env.local web/scripts/backfill-function-category.ts --missing-only
 */

import { createAdminClient } from "../lib/supabase/admin";
import { categorizePosting } from "../lib/analysis/categorizer";
import { getCategoryLabel } from "../lib/analysis/function-categories";

async function main() {
  console.log("🔄 Backfilling Function Category\n");

  const args = process.argv.slice(2);
  const testArg = args.find(arg => arg.startsWith("--test="));
  const limitArg = args.find(arg => arg.startsWith("--limit="));
  const missingOnlyArg = args.find(arg => arg === "--missing-only");
  
  const testSize = testArg ? parseInt(testArg.split("=")[1]) : undefined;
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;
  const missingOnly = !!missingOnlyArg;

  const supabase = createAdminClient();

  // Build query
  let query = supabase
    .from("job_postings")
    .select("id, title, description_text, company_id, companies(name)")
    .not("description_text", "is", null)
    .neq("description_text", "");

  if (missingOnly) {
    query = query.is("function_category", null);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data: jobs, error } = await query;

  if (error) {
    console.error("❌ Error fetching jobs:", error);
    process.exit(1);
  }

  if (!jobs || jobs.length === 0) {
    console.log("⚠️  No jobs found to process");
    process.exit(0);
  }

  // For test mode, randomly sample
  const jobsToProcess = testSize 
    ? jobs.sort(() => Math.random() - 0.5).slice(0, testSize)
    : jobs;

  console.log(`📊 Processing ${jobsToProcess.length} job(s)`);
  if (testSize) {
    console.log(`   (Test mode: sampled ${testSize} from ${jobs.length} total)\n`);
  } else {
    console.log();
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ id: string; title: string; error: string }> = [];

  // Process in batches to avoid overwhelming the API
  const BATCH_SIZE = 10;
  const DELAY_BETWEEN_BATCHES = 1000; // 1 second

  for (let i = 0; i < jobsToProcess.length; i += BATCH_SIZE) {
    const batch = jobsToProcess.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(async (job) => {
      const company = Array.isArray(job.companies) ? job.companies[0] : job.companies;
      const companyName = company?.name || "Unknown";

      try {
        // Use AI-based categorization for consistency
        const result = await categorizePosting(
          job.title,
          companyName,
          job.description_text || ""
        );

        if (!result) {
          throw new Error("categorizePosting returned null");
        }

        // Update job with function_category
        const { error: updateError } = await supabase
          .from("job_postings")
          .update({
            function_category: result.role_category,
          })
          .eq("id", job.id);

        if (updateError) {
          throw updateError;
        }

        succeeded++;
        processed++;
        
        const functionLabel = getCategoryLabel(result.role_category);
        if (processed % 10 === 0) {
          console.log(`   ✅ Processed ${processed}/${jobsToProcess.length}...`);
        } else if (processed <= 10 || processed % 50 === 0) {
          // Show details for first 10 and every 50th job
          console.log(`   ✅ "${job.title}" → ${functionLabel}`);
        }

        return { success: true };
      } catch (error) {
        failed++;
        processed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({
          id: job.id,
          title: job.title,
          error: errorMessage,
        });

        console.error(`   ❌ Failed for "${job.title}": ${errorMessage}`);
        return { success: false };
      }
    });

    await Promise.all(batchPromises);

    // Delay between batches to avoid rate limits
    if (i + BATCH_SIZE < jobsToProcess.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }

  console.log(`\n✅ Backfill complete!`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Succeeded: ${succeeded}`);
  console.log(`   Failed: ${failed}`);
  
  // Show summary of function categories assigned
  if (succeeded > 0) {
    console.log(`\n📊 Function Categories Assigned:`);
    const { data: categoryStats } = await supabase
      .from("job_postings")
      .select("function_category")
      .in("id", jobsToProcess.map(j => j.id))
      .not("function_category", "is", null);
    
    if (categoryStats) {
      const categoryCounts = new Map<string, number>();
      categoryStats.forEach((job: any) => {
        if (job.function_category) {
          const label = getCategoryLabel(job.function_category);
          categoryCounts.set(label, (categoryCounts.get(label) || 0) + 1);
        }
      });
      
      const sortedCategories = Array.from(categoryCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      
      sortedCategories.forEach(([label, count]) => {
        console.log(`   ${label}: ${count}`);
      });
    }
  }

  if (errors.length > 0) {
    console.log(`\n⚠️  Errors encountered:`);
    errors.slice(0, 10).forEach((e) => {
      console.log(`   - ${e.title}: ${e.error}`);
    });
    if (errors.length > 10) {
      console.log(`   ... and ${errors.length - 10} more`);
    }
  }

  if (testSize && succeeded > 0) {
    console.log(`\n💡 Test successful! Run without --test flag to process all jobs.`);
  }
}

main().catch(console.error);
