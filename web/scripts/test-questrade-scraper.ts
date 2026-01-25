#!/usr/bin/env npx tsx
/**
 * Test Questrade Dayforce Scraper
 * 
 * Tests that Questrade jobs are being scraped correctly with descriptions.
 * 
 * Note: Browser scraping requires a full browser environment and may not work locally.
 * It will work in production/GitHub Actions where Puppeteer can launch Chrome.
 * 
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/test-questrade-scraper.ts
 */

import { fetchJobs } from "../lib/scrapers";

async function main() {
  console.log("🧪 Testing Questrade Dayforce Scraper\n");
  console.log("═".repeat(70));

  const atsType = "dayforce";
  const atsIdentifier = "qfg";
  const careersUrl = "https://jobs.dayforcehcm.com/en-US/qfg/CANDIDATEPORTAL";

  console.log(`Configuration:`);
  console.log(`  ATS Type: ${atsType}`);
  console.log(`  Identifier: ${atsIdentifier}`);
  console.log(`  Careers URL: ${careersUrl}\n`);

  try {
    console.log("Fetching jobs...\n");
    console.log("Note: Browser scraping may not work locally. It will work in production/GitHub Actions.\n");
    
    const jobs = await fetchJobs(atsType, atsIdentifier, careersUrl);

    console.log(`✅ Successfully fetched ${jobs.length} job(s)\n`);

    if (jobs.length === 0) {
      console.log("⚠️  No jobs found. Possible reasons:");
      console.log("  - No active job postings");
      console.log("  - Browser scraping failed (expected locally)");
      console.log("  - API endpoints are protected (expected)");
      console.log("\n💡 Browser scraping will work in:");
      console.log("  - GitHub Actions workflows");
      console.log("  - Production environment");
      console.log("  - Environments with Chrome/Chromium installed");
      return;
    }

    // Analyze first few jobs
    const sampleSize = Math.min(5, jobs.length);
    console.log(`📊 Analyzing first ${sampleSize} job(s):\n`);

    let jobsWithDescriptions = 0;
    let jobsWithLocations = 0;
    let jobsWithDepartments = 0;

    for (let i = 0; i < sampleSize; i++) {
      const job = jobs[i];
      console.log(`${i + 1}. ${job.title}`);
      console.log(`   External ID: ${job.external_id}`);
      console.log(`   URL: ${job.url || "N/A"}`);
      
      // Check description
      const hasDescription = !!(job.description_html || job.description_text);
      if (hasDescription) {
        jobsWithDescriptions++;
        const descLength = (job.description_text || job.description_html || "").length;
        console.log(`   ✅ Description: ${descLength} chars`);
      } else {
        console.log(`   ❌ Description: MISSING`);
      }

      // Check location
      if (job.location) {
        jobsWithLocations++;
        console.log(`   ✅ Location: ${job.location}`);
      } else {
        console.log(`   ⚠️  Location: missing`);
      }

      // Check department
      if (job.department) {
        jobsWithDepartments++;
        console.log(`   ✅ Department: ${job.department}`);
      } else {
        console.log(`   ⚠️  Department: missing`);
      }

      console.log();
    }

    // Summary
    console.log("═".repeat(70));
    console.log("📊 Summary:");
    console.log("═".repeat(70));
    console.log(`  Total jobs: ${jobs.length}`);
    console.log(`  Jobs with descriptions: ${jobsWithDescriptions}/${sampleSize} (${Math.round(jobsWithDescriptions/sampleSize*100)}%)`);
    console.log(`  Jobs with locations: ${jobsWithLocations}/${sampleSize} (${Math.round(jobsWithLocations/sampleSize*100)}%)`);
    console.log(`  Jobs with departments: ${jobsWithDepartments}/${sampleSize} (${Math.round(jobsWithDepartments/sampleSize*100)}%)`);

    if (jobsWithDescriptions === 0) {
      console.log("\n⚠️  No descriptions found in sampled jobs.");
      console.log("   This is expected if browser scraping failed locally.");
      console.log("   Browser scraping will work in production/GitHub Actions.");
    } else if (jobsWithDescriptions < sampleSize) {
      console.log("\n⚠️  Some jobs are missing descriptions.");
      console.log("   This might be normal if some jobs don't have detail pages.");
    } else {
      console.log("\n✅ SUCCESS: All sampled jobs have descriptions!");
      console.log("   Questrade scraping is working correctly.");
    }

    console.log("\n💡 Next Steps:");
    console.log("  1. Test in production/GitHub Actions where browser scraping works");
    console.log("  2. Or manually trigger a scrape through the UI");
    console.log("  3. Verify descriptions are populated in the database");

  } catch (error) {
    console.error("\n❌ Error testing scraper:");
    console.error(error instanceof Error ? error.message : String(error));
    
    // Check if it's a browser scraping error
    if (error instanceof Error && error.message.includes("spawn")) {
      console.error("\n💡 This is expected - browser scraping requires Chrome/Chromium.");
      console.error("   It will work in production/GitHub Actions.");
    }
    
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
