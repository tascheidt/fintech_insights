/**
 * Re-categorize Jobs Set to "other" After Migration
 * 
 * After the database migration, many jobs were set to "other" because their
 * old categories don't exist in the new taxonomy. This script re-categorizes
 * them using AI extraction.
 * 
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/re-categorize-other-jobs.ts
 *   npx tsx --env-file=.env.local web/scripts/re-categorize-other-jobs.ts --limit=50
 *   npx tsx --env-file=.env.local web/scripts/re-categorize-other-jobs.ts --dry-run
 */

import { createAdminClient } from "../lib/supabase/admin";
import { extractJobStructure } from "../lib/analysis/structure";
import { getCategoryLabel } from "../lib/analysis/function-categories";

async function main() {
  console.log("🔄 Re-categorizing Jobs Set to 'other' After Migration\n");
  
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find(arg => arg.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;
  
  if (dryRun) {
    console.log("⚠️  DRY RUN MODE - No changes will be made\n");
  }
  
  const supabase = createAdminClient();
  
  // Get jobs with "other" category that have descriptions
  let query = supabase
    .from("job_postings")
    .select("id, title, description_text, department, companies(id, name)")
    .eq("function_category", "other")
    .not("description_text", "is", null)
    .neq("description_text", "");
  
  if (limit) {
    query = query.limit(limit);
  }
  
  const { data: allJobs, error: fetchError } = await query;
  
  if (fetchError) {
    console.error("❌ Error fetching jobs:", fetchError);
    process.exit(1);
  }
  
  // Apply limit if needed (in case query limit didn't work)
  const jobs = limit && allJobs ? allJobs.slice(0, limit) : allJobs;
  
  if (!jobs || jobs.length === 0) {
    console.log("✅ No jobs found with 'other' category that need re-categorization");
    process.exit(0);
  }
  
  console.log(`📊 Found ${jobs.length} job(s) to re-categorize\n`);
  
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ id: string; title: string; error: string }> = [];
  
  const BATCH_SIZE = 5; // Process in small batches to avoid rate limits
  const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds
  
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    
    for (const job of batch) {
      const company = Array.isArray(job.companies) ? job.companies[0] : job.companies;
      const companyName = company?.name || "Unknown";
      
      try {
        if (dryRun) {
          console.log(`   🔍 Would re-categorize: "${job.title}"`);
          continue;
        }
        
        // Extract structure using AI (this includes function_category)
        // Note: extractJobStructure requires description, title, and optional department
        const structure = await extractJobStructure(
          job.title,
          job.description_text || "",
          job.department || undefined
        );
        
        if (!structure || !structure.function_category) {
          skipped++;
          console.log(`   ⏭️  Skipped "${job.title}" - AI couldn't categorize`);
          continue;
        }
        
        // Update job with new category
        const { error: updateError } = await supabase
          .from("job_postings")
          .update({ function_category: structure.function_category })
          .eq("id", job.id);
        
        if (updateError) {
          throw updateError;
        }
        
        updated++;
        const categoryLabel = getCategoryLabel(structure.function_category);
        
        if (updated % 10 === 0) {
          console.log(`   ✅ Re-categorized ${updated}/${jobs.length}...`);
        } else if (updated <= 10) {
          console.log(`   ✅ "${job.title}" → ${categoryLabel}`);
        }
      } catch (error) {
        failed++;
        let errorMessage: string;
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === 'object' && error !== null) {
          const supabaseError = error as { message?: string; code?: string; details?: string };
          errorMessage = supabaseError.message || supabaseError.details || JSON.stringify(error);
        } else {
          errorMessage = String(error);
        }
        errors.push({
          id: job.id,
          title: job.title,
          error: errorMessage,
        });
        console.error(`   ❌ Failed for "${job.title}": ${errorMessage}`);
      }
    }
    
    // Delay between batches
    if (i + BATCH_SIZE < jobs.length && !dryRun) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }
  
  console.log(`\n✅ Re-categorization complete!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Failed: ${failed}`);
  
  if (errors.length > 0) {
    console.log(`\n❌ Errors (${errors.length}):`);
    for (const err of errors.slice(0, 10)) {
      console.log(`   - ${err.title}: ${err.error}`);
    }
    if (errors.length > 10) {
      console.log(`   ... and ${errors.length - 10} more`);
    }
  }
  
  if (updated > 0) {
    console.log(`\n💡 Tip: Run again to process remaining jobs (if any)`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
