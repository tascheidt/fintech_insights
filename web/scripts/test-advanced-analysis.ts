/**
 * Test script for advanced strategic analysis using gemini-3.1-pro-preview
 *
 * Tests:
 * 1. Web search grounding (performWebSearch)
 * 2. Full job analysis (analyzeJobAdvanced)
 * 3. Model fallback (flash fallback logic)
 *
 * Usage (run from the web/ directory):
 *   npx tsx --env-file=.env.local scripts/test-advanced-analysis.ts [company-name]
 *
 * Examples:
 *   npx tsx --env-file=.env.local scripts/test-advanced-analysis.ts
 *   npx tsx --env-file=.env.local scripts/test-advanced-analysis.ts "Wealthsimple"
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { performWebSearch, analyzeJobAdvanced } from "@/lib/analysis/advanced-strategic";

const TARGET_COMPANY = process.argv[2] ?? "Wealthsimple";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pass(msg: string) { console.log(`  ✅ ${msg}`); }
function fail(msg: string) { console.log(`  ❌ ${msg}`); }
function info(msg: string) { console.log(`  ℹ  ${msg}`); }
function section(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(title);
  console.log("=".repeat(60));
}

// ---------------------------------------------------------------------------
// Env checks
// ---------------------------------------------------------------------------

function checkEnv() {
  section("Environment Check");
  const required = ["GEMINI_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  let ok = true;
  for (const key of required) {
    if (process.env[key]) {
      pass(`${key} is set`);
    } else {
      fail(`${key} is missing`);
      ok = false;
    }
  }
  if (!ok) {
    console.error("\n❌ Missing required environment variables. Set them in .env.local and retry.");
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Test 1: Web Search
// ---------------------------------------------------------------------------

async function testWebSearch() {
  section(`TEST 1: Web Search Grounding — "${TARGET_COMPANY}"`);
  console.log(`  Model: gemini-3.1-pro-preview\n`);

  const start = Date.now();
  const results = await performWebSearch(TARGET_COMPANY);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  info(`Completed in ${elapsed}s`);

  if (results.length === 0) {
    console.log("  ⚠️  No results returned — model may not have invoked the search tool,");
    console.log("     or grounding is not enabled for this API key.");
  } else {
    pass(`Got ${results.length} grounding result(s)`);
    results.forEach((r, i) => {
      console.log(`\n  Result ${i + 1}:`);
      console.log(`    Title:   ${r.title}`);
      console.log(`    Snippet: ${r.snippet.substring(0, 100)}${r.snippet.length > 100 ? "..." : ""}`);
      console.log(`    URL:     ${r.url}`);
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Test 2: Full Job Analysis
// ---------------------------------------------------------------------------

async function testJobAnalysis(webResults: Awaited<ReturnType<typeof performWebSearch>>) {
  section(`TEST 2: Full Job Analysis — "${TARGET_COMPANY}"`);
  console.log(`  Model: gemini-3.1-pro-preview (flash fallback on quota)\n`);

  // Look up the company in the database
  const supabase = createAdminClient();
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name")
    .ilike("name", `%${TARGET_COMPANY}%`)
    .limit(1)
    .single();

  if (companyError || !company) {
    console.log(`  ⚠️  "${TARGET_COMPANY}" not found in database. Running with synthetic job data.`);
    return runSyntheticAnalysis(webResults);
  }

  info(`Found company: ${company.name} (${company.id})`);

  // Pull a recent job from the database to use as test input
  const { data: jobs } = await supabase
    .from("job_postings")
    .select("id, title, standardized_department, location, description_text")
    .eq("company_id", company.id)
    .order("first_seen_at", { ascending: false })
    .limit(1);

  const job = jobs?.[0];
  if (!job) {
    console.log(`  ⚠️  No job postings found for ${company.name}. Running with synthetic data.`);
    return runSyntheticAnalysis(webResults, company.id, company.name);
  }

  info(`Using job: "${job.title}" (${job.standardized_department ?? "unknown dept"})`);

  const start = Date.now();
  const result = await analyzeJobAdvanced({
    companyId: company.id,
    companyName: company.name,
    job: {
      title: job.title,
      standardized_department: job.standardized_department,
      location: job.location,
      description_text: job.description_text,
    },
    webSearchResults: webResults,
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  printAnalysisResult(result, elapsed);
}

async function runSyntheticAnalysis(
  webResults: Awaited<ReturnType<typeof performWebSearch>>,
  companyId = "00000000-0000-0000-0000-000000000000",
  companyName = TARGET_COMPANY
) {
  info("Using synthetic job: 'VP of Product, Payments'");

  const start = Date.now();
  const result = await analyzeJobAdvanced({
    companyId,
    companyName,
    job: {
      title: "VP of Product, Payments",
      standardized_department: "Product",
      location: "Toronto, ON",
      description_text: `We are looking for a VP of Product to lead our payments product team. 
You will own the roadmap for our core payments infrastructure, work with engineering to ship 
new payment rails, and define the strategy for expanding into new payment types including 
real-time payments and international transfers. You will report directly to the CPO.`,
    },
    webSearchResults: webResults,
    historicalContext: {
      summary: "No historical data available (synthetic test)",
      hiringTrends: [],
      recentExecutiveHires: [],
      departmentBreakdown: [],
      totalJobsInPeriod: 0,
    },
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  printAnalysisResult(result, elapsed);
}

function printAnalysisResult(result: Awaited<ReturnType<typeof analyzeJobAdvanced>>, elapsed: string) {
  if (!result) {
    fail(`Analysis returned null — check GEMINI_API_KEY and model access`);
    return;
  }

  pass(`Analysis complete in ${elapsed}s`);

  console.log("\n  ── Result ────────────────────────────────────────");
  console.log(`  Headline:          ${result.headline}`);
  console.log(`  Category:          ${result.category}`);
  console.log(`  Novelty Score:     ${result.novelty_score}/10`);
  console.log(`  Confidence:        ${result.confidence}`);
  console.log(`  Is New Direction:  ${result.is_new_direction}`);
  console.log(`  Is Executive:      ${result.is_executive_movement}`);
  console.log(`\n  Summary:`);
  console.log(`    ${result.insight_summary}`);
  console.log(`\n  What It Means:`);
  console.log(`    ${result.what_it_means}`);
  console.log(`\n  Strategic Signals:`);
  result.strategic_signals.forEach((s) => console.log(`    • ${s}`));
  if (result.web_corroboration) {
    console.log(`\n  Web Corroboration:`);
    console.log(`    ${result.web_corroboration.substring(0, 200)}...`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🧪 Advanced Strategic Analysis — Model Test");
  console.log(`   Target company: ${TARGET_COMPANY}`);
  console.log(`   Model: gemini-3.1-pro-preview\n`);

  checkEnv();

  const webResults = await testWebSearch();
  await testJobAnalysis(webResults);

  console.log("\n✅ All tests completed.\n");
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
