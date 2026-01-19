#!/usr/bin/env npx tsx
/**
 * Verify Silver Layer Data in Database
 * 
 * Checks if Silver Layer columns were populated correctly after scraping.
 * 
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/verify-silver-layer.ts
 */

import { createAdminClient } from "../lib/supabase/admin";

const SQL_QUERY = `
SELECT 
  title,
  seniority_level,
  salary_min,
  salary_max,
  tech_stack,
  summary,
  first_seen_date
FROM job_postings
WHERE 
  tech_stack IS NOT NULL 
  AND tech_stack != '[]'::jsonb
ORDER BY first_seen_date DESC
LIMIT 5;
`;

async function main() {
  console.log("🔍 Verifying Silver Layer Data in Database\n");
  console.log("═".repeat(70));
  console.log("SQL Query:");
  console.log("═".repeat(70));
  console.log(SQL_QUERY);
  console.log("═".repeat(70));
  console.log("\n📊 Results:\n");

  const supabase = createAdminClient();

  try {
    // Query using Supabase client (equivalent to SQL query above)
    const { data: jobs, error } = await supabase
      .from("job_postings")
      .select("title, seniority_level, salary_min, salary_max, tech_stack, summary, first_seen_date")
      .not("tech_stack", "is", null)
      .neq("tech_stack", "[]")
      .order("first_seen_date", { ascending: false })
      .limit(5);

    if (error) {
      console.error("❌ Query error:", error);
      process.exit(1);
    }

    if (!jobs || jobs.length === 0) {
      console.log("⚠️  No jobs found with Silver Layer data populated.");
      console.log("\nThis could mean:");
      console.log("  1. The migration hasn't been run yet");
      console.log("  2. No jobs have been scraped since the migration");
      console.log("  3. The extraction process hasn't run yet");
      console.log("\nTo check all jobs (including those without Silver Layer data):");
      console.log("  Run: SELECT COUNT(*) FROM job_postings;");
      return;
    }

    console.log(`✅ Found ${jobs.length} job(s) with Silver Layer data:\n`);

    jobs.forEach((job, index) => {
      console.log(`${index + 1}. ${job.title}`);
      console.log("   ─".repeat(35));
      console.log(`   Seniority Level: ${job.seniority_level || "❌ Not set"}`);
      console.log(`   Salary: ${job.salary_min && job.salary_max 
        ? `$${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()}` 
        : "❌ Not set"}`);
      console.log(`   Tech Stack: ${Array.isArray(job.tech_stack) && job.tech_stack.length > 0
        ? `[${job.tech_stack.join(", ")}]`
        : job.tech_stack 
          ? JSON.stringify(job.tech_stack)
          : "❌ Not set"}`);
      console.log(`   Summary: ${job.summary 
        ? `✅ ${job.summary.substring(0, 100)}${job.summary.length > 100 ? "..." : ""}` 
        : "❌ Not set"}`);
      console.log(`   First Seen: ${new Date(job.first_seen_date).toLocaleString()}`);
      console.log();
    });

    console.log("═".repeat(70));
    console.log("✅ Verification complete!");
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
