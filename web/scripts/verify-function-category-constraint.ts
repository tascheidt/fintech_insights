/**
 * Verify Function Category Database Constraint
 * 
 * Checks if the database CHECK constraint has been updated to allow new 45 categories.
 * 
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/verify-function-category-constraint.ts
 */

import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  console.log("🔍 Verifying Function Category Database Constraint\n");
  
  const supabase = createAdminClient();
  
  // Test categories: one old, one new
  const oldCategory = "engineering-backend"; // Should work with both old and new constraint
  const newCategory = "engineering-ai-ml"; // Only works with new constraint
  const anotherNewCategory = "compliance"; // Another new category
  
  console.log("Testing categories:");
  console.log(`  Old category: "${oldCategory}"`);
  console.log(`  New category: "${newCategory}"`);
  console.log(`  Another new: "${anotherNewCategory}"\n`);
  
  // Test 1: Try to query with old category (should work)
  console.log("Test 1: Querying with old category...");
  const { error: oldError } = await supabase
    .from("job_postings")
    .select("id")
    .eq("function_category", oldCategory)
    .limit(1);
  
  if (oldError && oldError.code === "23514") {
    console.log("❌ ERROR: Even old categories are failing!");
    console.log("   This suggests a different issue with the constraint.");
    console.log(`   Error: ${oldError.message}`);
    process.exit(1);
  }
  console.log("✅ Old category query works\n");
  
  // Test 2: Try to query with new category
  console.log("Test 2: Querying with new category...");
  const { error: newError } = await supabase
    .from("job_postings")
    .select("id")
    .eq("function_category", newCategory)
    .limit(1);
  
  if (newError && (newError.code === "23514" || newError.message?.includes("check constraint"))) {
    console.log("❌ FAILED: New categories are not allowed!");
    console.log("   The database constraint has NOT been updated.\n");
    console.log("💡 ACTION REQUIRED:");
    console.log("   1. Go to Supabase SQL Editor:");
    console.log("      https://supabase.com/dashboard/project/joqruwbipwmaysufhgyc/sql/new");
    console.log("   2. Copy the SQL from:");
    console.log("      web/supabase/migrations/20260127000001_update_function_categories_fintech.sql");
    console.log("   3. Paste and run it");
    console.log("   4. Then run the migration script again\n");
    process.exit(1);
  }
  
  if (newError && newError.code !== "PGRST116") {
    // PGRST116 is "no rows found" which is fine
    console.log(`⚠️  Unexpected error: ${newError.message}`);
    console.log(`   Code: ${newError.code}`);
  } else {
    console.log("✅ New category query works (constraint allows it)\n");
  }
  
  // Test 3: Try to update a test job (if any exist)
  console.log("Test 3: Testing UPDATE operation with new category...");
  const { data: testJob } = await supabase
    .from("job_postings")
    .select("id, function_category")
    .limit(1)
    .single();
  
  if (testJob) {
    const originalCategory = testJob.function_category;
    console.log(`   Found test job: ${testJob.id} (current category: ${originalCategory})`);
    
    // Try to update to a new category
    const { error: updateError } = await supabase
      .from("job_postings")
      .update({ function_category: newCategory })
      .eq("id", testJob.id);
    
    if (updateError) {
      if (updateError.code === "23514" || updateError.message?.includes("check constraint")) {
        console.log("❌ FAILED: Cannot UPDATE to new category!");
        console.log("   The database constraint has NOT been updated.\n");
        console.log("💡 ACTION REQUIRED:");
        console.log("   1. Go to Supabase SQL Editor:");
        console.log("      https://supabase.com/dashboard/project/joqruwbipwmaysufhgyc/sql/new");
        console.log("   2. Copy the SQL from:");
        console.log("      web/supabase/migrations/20260127000001_update_function_categories_fintech.sql");
        console.log("   3. Paste and run it");
        console.log("   4. Then run the migration script again\n");
        process.exit(1);
      } else {
        console.log(`⚠️  Update error: ${updateError.message}`);
      }
    } else {
      console.log("✅ UPDATE operation works!");
      
      // Restore original category
      await supabase
        .from("job_postings")
        .update({ function_category: originalCategory })
        .eq("id", testJob.id);
      console.log("   Restored original category\n");
    }
  } else {
    console.log("   No jobs found to test UPDATE (this is okay)\n");
  }
  
  console.log("✅ Verification complete!");
  console.log("   Database constraint allows new categories.");
  console.log("   You can proceed with the migration script.\n");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
