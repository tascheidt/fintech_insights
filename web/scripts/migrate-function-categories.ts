/**
 * Migrate Function Categories from Old to New Taxonomy
 * 
 * Maps old 27 categories to new 45 fintech-specific categories.
 * Handles renamed, merged, and split categories.
 * 
 * IMPORTANT: Run the database migration FIRST:
 *   1. Go to Supabase SQL Editor
 *   2. Run: web/supabase/migrations/20260127000001_update_function_categories_fintech.sql
 *   3. Or verify with: npx tsx --env-file=.env.local web/scripts/verify-function-category-constraint.ts
 * 
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/migrate-function-categories.ts
 *   npx tsx --env-file=.env.local web/scripts/migrate-function-categories.ts --dry-run
 */

import { createAdminClient } from "../lib/supabase/admin";

// Mapping from old categories to new categories
const CATEGORY_MAPPING: Record<string, string> = {
  // Direct mappings (no change)
  "engineering-backend": "engineering-backend",
  "engineering-frontend": "engineering-frontend",
  "engineering-fullstack": "engineering-fullstack",
  "engineering-mobile": "engineering-mobile",
  "engineering-data": "engineering-data",
  "engineering-security": "engineering-security",
  "engineering-qa": "engineering-qa",
  "product-management": "product-management",
  "product-research": "product-research",
  
  // Renamed categories
  "engineering-ml": "engineering-ai-ml",
  "engineering-devops": "engineering-platform-sre-devops",
  "product-design": "product-design-ux",
  "data-analytics": "data-analytics-bi",
  "sales": "sales-account-executives",
  "customer-success": "account-management-customer-success",
  "customer-support": "customer-support-cx", // Note: customer-support also exists in new taxonomy
  "finance": "finance-accounting",
  "hr-people": "people-ops-hr",
  "operations": "business-operations",
  "leadership": "executive-leadership",
  "marketing-growth": "marketing-growth-performance",
  
  // Merged categories
  "marketing-product": "marketing-product-brand",
  "marketing-content": "marketing-product-brand",
  "marketing-brand": "marketing-product-brand",
  
  // Split categories (default mappings - may need manual review)
  "legal-compliance": "compliance", // Default to compliance, can be refined to "legal" if needed
  "risk": "risk-management", // Default to risk-management, can be refined to "fraud-trust-safety" if needed
};

async function main() {
  console.log("🔄 Function Category Migration Script\n");
  
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  
  if (dryRun) {
    console.log("⚠️  DRY RUN MODE - No changes will be made\n");
  }
  
  console.log("⚠️  IMPORTANT: Make sure you've run the database migration first!");
  console.log("   Migration file: web/supabase/migrations/20260127000001_update_function_categories_fintech.sql");
  console.log("   Run it in Supabase SQL Editor or via migration script");
  console.log("\n💡 After this script, run re-categorize-other-jobs.ts to categorize jobs set to 'other'\n");
  
  const supabase = createAdminClient();
  
  // Verify database constraint allows new categories by testing a new category
  console.log("🔍 Verifying database constraint allows new categories...");
  const testCategory = "engineering-ai-ml"; // A new category
  const { error: testError } = await supabase
    .from("job_postings")
    .select("id")
    .eq("function_category", testCategory)
    .limit(1);
  
  // If we get a constraint violation error, the migration hasn't been run
  if (testError && (testError.message?.includes("check constraint") || testError.code === "23514")) {
    console.error("\n❌ ERROR: Database constraint has not been updated!");
    console.error("   The CHECK constraint still only allows old categories.");
    console.error("\n💡 You must run the database migration FIRST:");
    console.error("   1. Go to Supabase SQL Editor");
    console.error("   2. Run: web/supabase/migrations/20260127000001_update_function_categories_fintech.sql");
    console.error("   3. Then run this script again\n");
    process.exit(1);
  }
  
  console.log("✅ Database constraint verified (or no constraint violation detected)\n");
  
  // Get all jobs that need migration (including those set to "other" by the migration)
  // We'll check if they have old categories that should be mapped to new ones
  const { data: jobs, error: fetchError } = await supabase
    .from("job_postings")
    .select("id, title, function_category")
    .not("function_category", "is", null);
  
  if (fetchError) {
    console.error("❌ Error fetching jobs:", fetchError);
    process.exit(1);
  }
  
  if (!jobs || jobs.length === 0) {
    console.log("✅ No jobs found with old categories to migrate");
    process.exit(0);
  }
  
  console.log(`📊 Found ${jobs.length} jobs to migrate\n`);
  
  // Count categories that need migration
  // Include jobs set to "other" that might have been old categories
  const needsMigration = jobs.filter(
    (job) => {
      const cat = job.function_category;
      // Include if it's in the mapping (old category) OR if it's "other" (might have been set by migration)
      return cat && (CATEGORY_MAPPING[cat] || cat === "other");
    }
  );
  
  const alreadyNew = jobs.filter(
    (job) => {
      const cat = job.function_category;
      // Already using a new category (not in mapping and not "other")
      return cat && !CATEGORY_MAPPING[cat] && cat !== "other";
    }
  );
  
  console.log(`📋 Jobs needing migration: ${needsMigration.length}`);
  console.log(`✅ Jobs already using new categories: ${alreadyNew.length}\n`);
  
  if (needsMigration.length === 0) {
    console.log("✅ All jobs already use new categories");
    process.exit(0);
  }
  
  // Group by old category for reporting
  const byOldCategory = new Map<string, number>();
  for (const job of needsMigration) {
    const oldCat = job.function_category!;
    byOldCategory.set(oldCat, (byOldCategory.get(oldCat) || 0) + 1);
  }
  
  console.log("📊 Migration Summary:\n");
  for (const [oldCat, count] of Array.from(byOldCategory.entries()).sort((a, b) => b[1] - a[1])) {
    const newCat = CATEGORY_MAPPING[oldCat];
    console.log(`  ${oldCat} → ${newCat}: ${count} jobs`);
  }
  console.log();
  
  if (dryRun) {
    console.log("✅ Dry run complete. Run without --dry-run to apply changes.");
    process.exit(0);
  }
  
  // Perform migration
  let updated = 0;
  let failed = 0;
  const errors: Array<{ id: string; title: string; error: string }> = [];
  
  for (const job of needsMigration) {
    const oldCat = job.function_category!;
    
    // If it's "other", we can't map it (it was set by the migration for invalid categories)
    // These will need to be re-categorized by AI later
    if (oldCat === "other") {
      console.log(`   ⏭️  Skipping "${job.title}" - set to "other" (will need AI re-categorization)`);
      continue;
    }
    
    const newCat = CATEGORY_MAPPING[oldCat];
    
    if (!newCat) {
      console.warn(`⚠️  No mapping found for "${oldCat}" (job: ${job.title}) - keeping as-is`);
      continue;
    }
    
    try {
      const { error: updateError } = await supabase
        .from("job_postings")
        .update({ function_category: newCat })
        .eq("id", job.id);
      
      if (updateError) {
        // Check if it's a constraint violation
        if (updateError.code === "23514" || updateError.message?.includes("check constraint")) {
          throw new Error(`CHECK constraint violation: Database doesn't allow category "${newCat}". Make sure you've run the database migration first!`);
        }
        throw updateError;
      }
      
      updated++;
      if (updated % 100 === 0) {
        console.log(`   ✅ Updated ${updated}/${needsMigration.length}...`);
      }
    } catch (error) {
      failed++;
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        // Handle Supabase errors which are objects
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
  
  console.log(`\n✅ Migration complete!`);
  console.log(`   Updated: ${updated}`);
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
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
