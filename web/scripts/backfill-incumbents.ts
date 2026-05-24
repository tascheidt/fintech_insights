/**
 * Backfill strategic insights + tech stacks for every incumbent bank.
 *
 * Targets `companies WHERE tier = 'incumbent' AND is_active = true`. For each
 * bank:
 *  1. generateCompanyInsight() with forceRegenerate=true (idempotent if a
 *     recent row already exists, but `force` skips the 7-day rate limit so
 *     re-runs always refresh).
 *  2. aggregateTechStackFromJobs → enrichTechStackWithAnalysis → store on
 *     `companies.tech_stack`.
 *
 * Sequential per company; ~30–60s of Gemini work per bank, so the full pass
 * over 5 incumbents takes ~5 minutes. Idempotent — re-running picks up where
 * it left off (if `--only` is omitted, every bank gets refreshed).
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/backfill-incumbents.ts
 *   npx tsx --env-file=.env.local scripts/backfill-incumbents.ts --only scotiabank,td
 *   npx tsx --env-file=.env.local scripts/backfill-incumbents.ts --skip-insights
 *   npx tsx --env-file=.env.local scripts/backfill-incumbents.ts --skip-tech
 */

import { createAdminClient } from "../lib/supabase/admin";
import { generateCompanyInsight } from "../lib/analysis/company-insights";
import { aggregateTechStackFromJobs } from "../lib/ai/tech-stack-aggregation";
import { enrichTechStackWithAnalysis } from "../lib/ai/tech-stack-extraction";
import { buildTechStackStrategicContext } from "../lib/analysis/strategic-context";
import { getActiveTechStackAiConfig } from "../lib/ai/prompt-config";

interface Flags {
  only: string[] | null;       // slugs allowlist
  skipInsights: boolean;
  skipTech: boolean;
}

function parseFlags(argv: string[]): Flags {
  let only: string[] | null = null;
  let skipInsights = false;
  let skipTech = false;
  for (const a of argv) {
    if (a.startsWith("--only=")) {
      only = a.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--only") {
      // handled by paired arg in next loop iteration if used as `--only x`
    } else if (a === "--skip-insights") {
      skipInsights = true;
    } else if (a === "--skip-tech") {
      skipTech = true;
    }
  }
  // also support `--only foo,bar` (space-separated arg)
  const idx = argv.indexOf("--only");
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith("--")) {
    only = argv[idx + 1].split(",").map((s) => s.trim()).filter(Boolean);
  }
  return { only, skipInsights, skipTech };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const supabase = createAdminClient();

  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY is required.");
    process.exit(1);
  }

  console.log("🏦 Backfill incumbent intelligence");
  console.log("═".repeat(70));

  let query = supabase
    .from("companies")
    .select("id, slug, name, tech_stack_generated_at")
    .eq("tier", "incumbent")
    .eq("is_active", true)
    .order("slug");
  if (flags.only) {
    query = query.in("slug", flags.only);
  }

  const { data: banks, error } = await query;
  if (error || !banks || banks.length === 0) {
    console.error(`No incumbent companies found: ${error?.message ?? "empty result"}`);
    process.exit(1);
  }

  console.log(`Found ${banks.length} bank(s): ${banks.map((b) => b.slug).join(", ")}`);
  console.log(
    `Insights: ${flags.skipInsights ? "SKIP" : "REGENERATE"}    Tech stacks: ${flags.skipTech ? "SKIP" : "REGENERATE"}\n`
  );

  const summary: Array<{
    slug: string;
    insightOk: boolean;
    techOk: boolean;
    insightError?: string;
    techError?: string;
    elapsedMs: number;
  }> = [];

  for (let i = 0; i < banks.length; i++) {
    const bank = banks[i];
    const progress = `[${i + 1}/${banks.length}]`;
    console.log(`${progress} ${bank.name} (${bank.slug})`);
    const tStart = Date.now();
    const result: (typeof summary)[number] = {
      slug: bank.slug,
      insightOk: false,
      techOk: false,
      elapsedMs: 0,
    };

    // 1) Insight
    if (!flags.skipInsights) {
      try {
        // Clear any stale lock so a previous interrupted run doesn't block us.
        await supabase
          .from("insight_generation_locks")
          .delete()
          .eq("company_id", bank.id);

        const t0 = Date.now();
        const insight = await generateCompanyInsight(bank.id, bank.name, {
          periodDays: 90,
          researchDepth: "deep",
          forceRegenerate: true,
        });
        const dt = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(
          `   ✅ insight (${dt}s) — "${insight.headline}" significance=${insight.significanceScore}/10`
        );
        result.insightOk = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`   ❌ insight failed: ${msg}`);
        result.insightError = msg;
      }
    }

    // 2) Tech stack
    if (!flags.skipTech) {
      try {
        const t0 = Date.now();
        const raw = await aggregateTechStackFromJobs(bank.id);
        if (raw.technologies.length === 0) {
          console.log(`   ⚠️  tech-stack skipped — no tech data found in job postings`);
        } else {
          const strategicContext = await buildTechStackStrategicContext(bank.id);
          const config = await getActiveTechStackAiConfig();
          const enriched = await enrichTechStackWithAnalysis(
            bank.name,
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
            .eq("id", bank.id);
          const dt = ((Date.now() - t0) / 1000).toFixed(1);
          const catCount = enriched.categories?.length ?? 0;
          console.log(
            `   ✅ tech_stack (${dt}s) — ${catCount} categories from ${raw.totalJobsAnalyzed} jobs`
          );
          result.techOk = true;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`   ❌ tech_stack failed: ${msg}`);
        result.techError = msg;
      }
    }

    result.elapsedMs = Date.now() - tStart;
    summary.push(result);
    console.log("");
  }

  console.log("═".repeat(70));
  console.log("Summary:");
  for (const s of summary) {
    const flags: string[] = [];
    flags.push(`insight:${s.insightOk ? "ok" : s.insightError ? "FAIL" : "skip"}`);
    flags.push(`tech:${s.techOk ? "ok" : s.techError ? "FAIL" : "skip"}`);
    console.log(`  ${s.slug.padEnd(12)} ${(s.elapsedMs / 1000).toFixed(1).padStart(6)}s   ${flags.join("   ")}`);
  }
  const fails = summary.filter((s) => s.insightError || s.techError);
  if (fails.length > 0) {
    console.log(`\n⚠️  ${fails.length} bank(s) had failures.`);
    process.exit(1);
  }
  console.log("\n✅ Backfill complete.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
