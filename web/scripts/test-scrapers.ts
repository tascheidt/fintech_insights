/**
 * Test script to verify all scrapers are working correctly.
 * Run: npx tsx --env-file=.env.local scripts/test-scrapers.ts
 */

import { fetchJobs } from "@/lib/scrapers";

interface CompanyConfig {
  name: string;
  atsType: string;
  atsIdentifier: string;
  careersUrl?: string;
  expectedMinJobs: number;
}

const companies: CompanyConfig[] = [
  {
    name: "Tangerine (Scotiabank)",
    atsType: "scotiabank",
    atsIdentifier: "Tangerine",
    careersUrl: "https://jobs.scotiabank.com/Tangerine/search/",
    expectedMinJobs: 10,
  },
  {
    name: "Wealthsimple (Lever)",
    atsType: "lever",
    atsIdentifier: "wealthsimple",
    expectedMinJobs: 1,
  },
  {
    name: "Monzo (Greenhouse)",
    atsType: "greenhouse",
    atsIdentifier: "monzo",
    expectedMinJobs: 1,
  },
  {
    name: "Starling Bank (Workable)",
    atsType: "workable",
    atsIdentifier: "starling-bank",
    expectedMinJobs: 1,
  },
];

async function testScraper(config: CompanyConfig) {
  const start = Date.now();
  try {
    const jobs = await fetchJobs(
      config.atsType,
      config.atsIdentifier,
      config.careersUrl
    );
    const elapsed = Date.now() - start;

    const pass = jobs.length >= config.expectedMinJobs;
    const status = pass ? "PASS" : "FAIL";
    console.log(`\n${status} | ${config.name}`);
    console.log(`  Jobs found: ${jobs.length} (expected >= ${config.expectedMinJobs})`);
    console.log(`  Time: ${elapsed}ms`);

    if (jobs.length > 0) {
      const sample = jobs[0];
      console.log(`  Sample job:`);
      console.log(`    Title: ${sample.title}`);
      console.log(`    ID: ${sample.external_id}`);
      console.log(`    Location: ${sample.location || "(none)"}`);
      console.log(`    Posted: ${sample.posted_date || "(none)"}`);
      console.log(`    URL: ${sample.url || "(none)"}`);
    }

    return { name: config.name, pass, jobCount: jobs.length, elapsed };
  } catch (error) {
    const elapsed = Date.now() - start;
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`\nFAIL | ${config.name}`);
    console.log(`  Error: ${msg}`);
    console.log(`  Time: ${elapsed}ms`);
    return { name: config.name, pass: false, jobCount: 0, elapsed, error: msg };
  }
}

async function main() {
  console.log("=== Scraper Test Suite ===");
  console.log(`Testing ${companies.length} companies...\n`);

  // Skip Questrade (dayforce) since it requires browser/GitHub Actions
  console.log(
    "NOTE: Questrade (Dayforce) is skipped — it requires a browser and runs via GitHub Actions."
  );

  const results = [];
  for (const company of companies) {
    results.push(await testScraper(company));
  }

  // Summary
  console.log("\n\n=== Summary ===");
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);

  for (const r of results) {
    console.log(
      `  ${r.pass ? "✅" : "❌"} ${r.name}: ${r.jobCount} jobs (${r.elapsed}ms)`
    );
  }

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
