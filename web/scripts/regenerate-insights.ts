#!/usr/bin/env npx tsx
/**
 * Regenerate Strategic Insights for All Companies
 *
 * Forces regeneration of company-level strategic insights using the latest
 * Gemini models. Each company takes ~1-2 minutes.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/regenerate-insights.ts
 */

import { createAdminClient } from "../lib/supabase/admin";
import { generateCompanyInsight } from "../lib/analysis/company-insights";

async function main() {
  const supabase = createAdminClient();

  console.log("🔄 Regenerating Strategic Insights for All Companies\n");
  console.log("═".repeat(70));

  // Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY environment variable is not set");
    process.exit(1);
  }

  // Fetch all companies
  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, name, slug")
    .order("name");

  if (error || !companies) {
    console.error("❌ Error fetching companies:", error);
    process.exit(1);
  }

  console.log(`📋 Found ${companies.length} companies to process\n`);

  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ name: string; error: string }> = [];

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    const progress = `[${i + 1}/${companies.length}]`;

    console.log(`${progress} Generating insight for ${company.name}...`);
    const startTime = Date.now();

    try {
      // Clear any stale locks for this company first
      await supabase
        .from("insight_generation_locks")
        .delete()
        .eq("company_id", company.id);

      const insight = await generateCompanyInsight(company.id, company.name, {
        periodDays: 90,
        researchDepth: "deep",
        forceRegenerate: true,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ✅ Done in ${elapsed}s — "${insight.headline}" (significance: ${insight.significanceScore}/10)`);
      succeeded++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ❌ Failed after ${elapsed}s: ${errorMessage}`);
      failed++;
      errors.push({ name: company.name, error: errorMessage });
    }
  }

  // Summary
  console.log("\n" + "═".repeat(70));
  console.log("📊 Regeneration Summary:");
  console.log("═".repeat(70));
  console.log(`  Total companies: ${companies.length}`);
  console.log(`  ✅ Succeeded: ${succeeded}`);
  console.log(`  ❌ Failed: ${failed}`);

  if (errors.length > 0) {
    console.log("\n⚠️  Errors:");
    errors.forEach((err) => {
      console.log(`  - ${err.name}: ${err.error}`);
    });
  }

  console.log("\n✅ Regeneration complete!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
