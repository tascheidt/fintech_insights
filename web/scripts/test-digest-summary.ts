/**
 * Test script for weekly digest global summary generation.
 * 
 * This script generates a weekly digest and prints the global summary
 * to verify the cross-company trend analysis is working correctly.
 * 
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-digest-summary.ts
 *   npx tsx --env-file=.env.local scripts/test-digest-summary.ts --days=14
 */

import { createWeeklyDigest } from "@/lib/analysis/digest";

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let daysBack = 7;
  
  for (const arg of args) {
    if (arg.startsWith("--days=")) {
      daysBack = parseInt(arg.split("=")[1], 10) || 7;
    }
  }

  console.log("=".repeat(60));
  console.log("Weekly Digest Global Summary Test");
  console.log("=".repeat(60));
  console.log(`Looking back ${daysBack} days...\n`);

  try {
    const digest = await createWeeklyDigest(daysBack);

    console.log("\n" + "=".repeat(60));
    console.log("DIGEST OVERVIEW");
    console.log("=".repeat(60));
    console.log(`Week: ${digest.week_start.slice(0, 10)} to ${digest.week_end.slice(0, 10)}`);
    console.log(`Total Jobs: ${digest.total_jobs}`);
    console.log(`Total Companies: ${digest.total_companies}`);

    console.log("\n" + "=".repeat(60));
    console.log("GLOBAL SUMMARY (Cross-Company Trends)");
    console.log("=".repeat(60));
    
    if (digest.global_summary) {
      console.log(`\nHeadline: ${digest.global_summary.headline}`);
      console.log(`\nBody:\n${digest.global_summary.body}`);
    } else {
      console.log("\n[No global summary generated - insufficient data or API error]");
    }

    console.log("\n" + "=".repeat(60));
    console.log("COMPANY SUMMARIES");
    console.log("=".repeat(60));
    
    for (const company of digest.companies) {
      console.log(`\n${company.company_name} (${company.new_job_count} jobs)`);
      console.log(`  Headline: ${company.ai_commentary.headline}`);
      console.log(`  Top Tech: ${company.dominant_tech.join(", ") || "N/A"}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("TEST COMPLETE");
    console.log("=".repeat(60));
    
  } catch (error) {
    console.error("Error generating digest:", error);
    process.exit(1);
  }
}

main();
