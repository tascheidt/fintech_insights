/**
 * Verify Supabase migration was successful
 * Usage: npx tsx scripts/verify-migration.ts
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function verify() {
  console.log("🔍 Checking Supabase tables...\n");

  // Check tables exist
  const tables = [
    "organizations",
    "profiles", 
    "companies",
    "job_postings",
    "strategic_insights",
    "job_templates",
    "posting_events",
    "audit_log",
  ];

  let allOk = true;

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });

    if (error) {
      console.log(`❌ ${table}: ERROR - ${error.message}`);
      allOk = false;
    } else {
      console.log(`✅ ${table}: OK (${count ?? 0} rows)`);
    }
  }

  // Check default organization
  console.log("\n🏢 Checking default organization...");
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("*")
    .eq("slug", "default")
    .single();

  if (orgError) {
    console.log("❌ Default organization: NOT FOUND");
    allOk = false;
  } else {
    console.log(`✅ Default organization: "${org.name}" (ID: ${org.id})`);
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  if (allOk) {
    console.log("✅ Migration verification PASSED!");
    console.log("   All 8 tables created successfully.");
    console.log("   Default organization exists.");
  } else {
    console.log("❌ Migration verification FAILED!");
    console.log("   Please check the errors above.");
  }
  console.log("=".repeat(50));
}

verify().catch(console.error);
