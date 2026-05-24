/**
 * One-off: regenerate strategic insight + tech stack for Simplii.
 *
 * Simplii is a CIBC sub-brand seeded by migration
 * `20260524000000_parent_company.sql`. With only 2 historical (closed)
 * Simplii rows, the insight leans heavily on grounded research and the
 * tech-stack will likely come back empty/thin — both are accurate.
 *
 * Usage (from `web/`):
 *   npx tsx --env-file=.env.local scripts/regenerate-simplii.ts
 */

import { createAdminClient } from "../lib/supabase/admin";
import { generateCompanyInsight } from "../lib/analysis/company-insights";
import { aggregateTechStackFromJobs } from "../lib/ai/tech-stack-aggregation";
import { enrichTechStackWithAnalysis } from "../lib/ai/tech-stack-extraction";
import { buildTechStackStrategicContext } from "../lib/analysis/strategic-context";
import { getActiveTechStackAiConfig } from "../lib/ai/prompt-config";

async function main(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY required.");
    process.exit(1);
  }

  const supabase = createAdminClient();
  const { data: company, error } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("slug", "simplii")
    .single();
  if (error || !company) {
    console.error(`Simplii row not found: ${error?.message}`);
    process.exit(1);
  }

  console.log(`▶ ${company.name} (${company.slug})`);

  // Clear any stale insight lock.
  await supabase
    .from("insight_generation_locks")
    .delete()
    .eq("company_id", company.id);

  // 1) Strategic insight
  try {
    const t0 = Date.now();
    const insight = await generateCompanyInsight(company.id, company.name, {
      periodDays: 90,
      researchDepth: "deep",
      forceRegenerate: true,
    });
    console.log(
      `  ✅ insight (${((Date.now() - t0) / 1000).toFixed(1)}s) — "${insight.headline}" significance=${insight.significanceScore}/10`
    );
  } catch (err) {
    console.log(`  ❌ insight failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2) Tech stack
  try {
    const t0 = Date.now();
    const raw = await aggregateTechStackFromJobs(company.id);
    if (raw.technologies.length === 0) {
      console.log(`  ⚠️  tech_stack skipped — no tech signal in Simplii's 2 historical job rows`);
    } else {
      const strategicContext = await buildTechStackStrategicContext(company.id);
      const config = await getActiveTechStackAiConfig();
      const enriched = await enrichTechStackWithAnalysis(
        company.name,
        raw.technologies,
        raw.totalJobsAnalyzed,
        raw.periodStart,
        raw.periodEnd,
        strategicContext.context,
        config
      );
      await supabase
        .from("companies")
        .update({
          tech_stack: enriched,
          tech_stack_generated_at: new Date().toISOString(),
        })
        .eq("id", company.id);
      console.log(
        `  ✅ tech_stack (${((Date.now() - t0) / 1000).toFixed(1)}s) — ${enriched.categories?.length ?? 0} categories from ${raw.totalJobsAnalyzed} jobs`
      );
    }
  } catch (err) {
    console.log(`  ❌ tech_stack failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
