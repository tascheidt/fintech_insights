/**
 * Run database migration against Supabase using the Management API
 * 
 * Usage: 
 *   export SUPABASE_ACCESS_TOKEN=your-access-token
 *   npx tsx scripts/run-migration.ts
 * 
 * Get access token from: https://supabase.com/dashboard/account/tokens
 */

import * as fs from "fs";
import * as path from "path";

const PROJECT_REF = "joqruwbipwmaysufhgyc";

async function runMigration() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (!accessToken) {
    console.log("\n" + "=".repeat(70));
    console.log("MANUAL MIGRATION REQUIRED");
    console.log("=".repeat(70));
    console.log("\nThe migration SQL needs to be run in the Supabase SQL Editor.");
    console.log("\nSteps:");
    console.log("1. Go to: https://supabase.com/dashboard/project/joqruwbipwmaysufhgyc/sql/new");
    console.log("2. Copy the SQL below");
    console.log("3. Paste into the SQL Editor");
    console.log("4. Click 'Run'");
    console.log("\n" + "=".repeat(70));
    console.log("SQL TO RUN:");
    console.log("=".repeat(70) + "\n");
    
    const migrationPath = path.join(__dirname, "../supabase/migrations/20260117000000_initial_schema.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    console.log(sql);
    
    console.log("\n" + "=".repeat(70));
    console.log("After running the SQL, verify with:");
    console.log("  SELECT tablename FROM pg_tables WHERE schemaname = 'public';");
    console.log("=".repeat(70) + "\n");
    return;
  }

  // If we have an access token, use the Management API
  const migrationPath = path.join(__dirname, "../supabase/migrations/20260117000000_initial_schema.sql");
  const sql = fs.readFileSync(migrationPath, "utf-8");

  console.log("Running migration via Supabase Management API...");
  console.log("Project:", PROJECT_REF);

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Migration failed:", response.status, error);
    process.exit(1);
  }

  const result = await response.json();
  console.log("Migration completed successfully!");
  console.log("Result:", JSON.stringify(result, null, 2));
}

runMigration().catch(console.error);
