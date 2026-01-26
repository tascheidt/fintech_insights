#!/usr/bin/env npx tsx
/**
 * Test Questrade Scraper Description Extraction
 * 
 * Tests the Dayforce browser scraper directly to verify it extracts descriptions correctly.
 * This script can be run locally but browser scraping requires Chrome/Chromium.
 * 
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/test-questrade-scraper-description.ts
 */

import { fetchDayforceJobs } from "../lib/scrapers/dayforce";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

async function main() {
  console.log("🧪 Testing Questrade Dayforce Scraper\n");
  console.log("═".repeat(70));

  const atsIdentifier = "qfg"; // Questrade's Dayforce identifier

  console.log(`📋 Testing Dayforce scraper for: ${atsIdentifier}\n`);

  try {
    // Launch browser for testing
    console.log("🚀 Launching browser...");
    const executablePath = await chromium.executablePath();
    
    const browser = await puppeteer.launch({
      args: chromium.args,
      // @ts-expect-error - defaultViewport exists at runtime but types may be outdated
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: true,
    });

    console.log("✅ Browser launched\n");

    try {
      // Test the scraper
      console.log("🔄 Fetching jobs...");
      const jobs = await fetchDayforceJobs(atsIdentifier, browser);

      console.log(`\n✅ Scraper completed: Found ${jobs.length} job(s)\n`);

      if (jobs.length === 0) {
        console.log("⚠️  No jobs found. This might indicate:");
        console.log("   - API endpoints are protected");
        console.log("   - Browser scraping failed");
        console.log("   - No jobs available");
        return;
      }

      // Analyze each job
      console.log("📊 Job Analysis:\n");
      console.log("═".repeat(70));

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const htmlLen = job.description_html?.length || 0;
        const textLen = job.description_text?.length || 0;
        const hasValidDesc = htmlLen > 200 && textLen > 200;
        const hasSpinner = job.description_html?.includes('ant-spin-spinning') || false;

        console.log(`\n${i + 1}. ${job.title}`);
        console.log(`   External ID: ${job.external_id}`);
        console.log(`   URL: ${job.url}`);
        console.log(`   Description HTML: ${htmlLen} chars ${hasValidDesc ? "✅" : "❌"}`);
        console.log(`   Description Text: ${textLen} chars ${hasValidDesc ? "✅" : "❌"}`);
        if (hasSpinner) {
          console.log(`   ⚠️  WARNING: Contains loading spinner HTML!`);
        }
        console.log(`   Location: ${job.location || "N/A"}`);
        console.log(`   Department: ${job.department || "N/A"}`);

        // Show sample of description
        if (job.description_text && job.description_text.length > 0) {
          const sample = job.description_text.substring(0, 200);
          console.log(`   Sample: ${sample}...`);
        } else if (job.description_html && job.description_html.length > 0) {
          // Try to extract text from HTML
          const textSample = job.description_html
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 200);
          console.log(`   Sample (from HTML): ${textSample}...`);
        } else {
          console.log(`   ⚠️  No description content found!`);
        }
      }

      // Summary
      console.log("\n" + "═".repeat(70));
      console.log("📊 Summary:\n");
      const withValidDesc = jobs.filter(j => 
        (j.description_html?.length || 0) > 200 && 
        (j.description_text?.length || 0) > 200
      ).length;
      const withSpinner = jobs.filter(j => 
        j.description_html?.includes('ant-spin-spinning')
      ).length;

      console.log(`  Total Jobs: ${jobs.length}`);
      console.log(`  With Valid Descriptions: ${withValidDesc}/${jobs.length} (${Math.round((withValidDesc / jobs.length) * 100)}%)`);
      console.log(`  With Loading Spinner HTML: ${withSpinner}/${jobs.length} ${withSpinner > 0 ? "❌" : "✅"}`);

      if (withValidDesc === jobs.length && withSpinner === 0) {
        console.log("\n✅ SUCCESS: All jobs have valid descriptions!");
      } else {
        console.log("\n⚠️  WARNING: Some jobs are missing descriptions or contain loading HTML");
        if (withSpinner > 0) {
          console.log(`   - ${withSpinner} job(s) contain loading spinner HTML`);
          console.log("   - This indicates the scraper is capturing content before it loads");
        }
        if (withValidDesc < jobs.length) {
          console.log(`   - ${jobs.length - withValidDesc} job(s) are missing valid descriptions`);
        }
      }

    } finally {
      await browser.close();
      console.log("\n✅ Browser closed");
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("\n❌ Error:", errorMessage);
    
    if (errorMessage.includes("spawn") || errorMessage.includes("Unknown system error")) {
      console.error("\n⚠️  Browser scraping requires Chrome/Chromium.");
      console.error("   This script works best in GitHub Actions or production environments.");
      console.error("   For local testing, ensure Chrome is installed and accessible.");
    }
    
    process.exit(1);
  }
}

main().catch(console.error);
