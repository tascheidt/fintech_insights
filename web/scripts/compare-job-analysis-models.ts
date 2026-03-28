/**
 * Compare two Gemini models on the same job analysis pipeline (shared historical + web context).
 *
 * Does not write to the database. Use to decide whether Flash can replace Pro for analyze jobs.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/compare-job-analysis-models.ts "Wealthsimple"
 *   npx tsx --env-file=.env.local scripts/compare-job-analysis-models.ts --company=wealthsimple --limit=3
 *   npx tsx --env-file=.env.local scripts/compare-job-analysis-models.ts "Koho" --no-analysis-search
 *
 * Flags:
 *   --company=<slug-or-name>   Alternative to positional company arg
 *   --limit=N                  Jobs to sample (default 3)
 *   --arm-a=<model_id>         Default: gemini-pro-latest
 *   --arm-b=<model_id>         Default: gemini-3-flash-preview
 *   --no-analysis-search       Omit Google Search tool on the analysis call (context-only)
 *   --skip-prefetch-web        Empty web context (fast/cheap; not representative of production)
 *   --json                     Print one JSON object per job to stdout
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  analyzeJobAdvanced,
  performWebSearch,
  type AdvancedAnalyzeResult,
  type WebSearchContext,
} from "@/lib/analysis/advanced-strategic";
import { buildHistoricalContext } from "@/lib/analysis/context-builder";

const HISTORICAL_DAYS = 180;

function parseArgs(argv: string[]) {
  let positional: string | undefined;
  let limit = 3;
  let armA = "gemini-pro-latest";
  let armB = "gemini-3-flash-preview";
  let companyArg: string | undefined;
  let noAnalysisSearch = false;
  let skipPrefetchWeb = false;
  let json = false;

  for (const a of argv) {
    if (a.startsWith("--company=")) companyArg = a.slice("--company=".length);
    else if (a.startsWith("--limit=")) limit = Math.max(1, parseInt(a.slice("--limit=".length), 10) || 3);
    else if (a.startsWith("--arm-a=")) armA = a.slice("--arm-a=".length);
    else if (a.startsWith("--arm-b=")) armB = a.slice("--arm-b=".length);
    else if (a === "--no-analysis-search") noAnalysisSearch = true;
    else if (a === "--skip-prefetch-web") skipPrefetchWeb = true;
    else if (a === "--json") json = true;
    else if (!a.startsWith("--")) positional = a;
  }

  const company = companyArg ?? positional;
  return { company, limit, armA, armB, noAnalysisSearch, skipPrefetchWeb, json };
}

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a.map((x) => norm(x)).filter(Boolean));
  const sb = new Set(b.map((x) => norm(x)).filter(Boolean));
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

async function main() {
  const { company, limit, armA, armB, noAnalysisSearch, skipPrefetchWeb, json: jsonMode } = parseArgs(
    process.argv.slice(2)
  );

  if (!company?.trim()) {
    console.error("Usage: compare-job-analysis-models.ts <company name or slug> [flags]");
    process.exit(1);
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is required");
    process.exit(1);
  }

  const supabase = createAdminClient();
  const term = company.trim();

  const { data: companyRow, error: cErr } = await supabase
    .from("companies")
    .select("id, name, slug")
    .or("slug.eq." + term + ",name.ilike.%" + term + "%")
    .limit(1)
    .maybeSingle();

  if (cErr || !companyRow) {
    console.error("Company not found:", term, cErr?.message);
    process.exit(1);
  }

  const { data: jobs, error: jErr } = await supabase
    .from("job_postings")
    .select("id, title, standardized_department, location, description_text")
    .eq("company_id", companyRow.id)
    .eq("is_active", true)
    .order("first_seen_date", { ascending: false })
    .limit(limit);

  if (jErr || !jobs?.length) {
    console.error("No active jobs for company", companyRow.name);
    process.exit(1);
  }

  console.log("Company: " + companyRow.name + " (" + companyRow.id + ")");
  console.log("Sample: " + jobs.length + " job(s)  |  arm-a: " + armA + "  |  arm-b: " + armB);
  console.log(
    "Analysis Google Search: " + (noAnalysisSearch ? "off" : "on") + "  |  Web prefetch: " + (skipPrefetchWeb ? "skipped" : "performWebSearch")
  );
  console.log("");

  let webCtx: WebSearchContext = { synthesis: "", results: [] };
  if (!skipPrefetchWeb) {
    const t0 = Date.now();
    webCtx = await performWebSearch(companyRow.name);
    console.log(
      "Prefetched web context in " + ((Date.now() - t0) / 1000).toFixed(1) + "s (" + webCtx.results.length + " sources)\n"
    );
  }

  const histStart = Date.now();
  const historicalContext = await buildHistoricalContext(companyRow.id, HISTORICAL_DAYS);
  console.log("Historical context in " + ((Date.now() - histStart) / 1000).toFixed(1) + "s\n");

  let catMatch = 0;
  let jaccardSum = 0;
  let execMatch = 0;

  for (const job of jobs) {
    const base = {
      companyId: companyRow.id,
      companyName: companyRow.name,
      job: {
        title: job.title,
        standardized_department: job.standardized_department,
        location: job.location,
        description_text: job.description_text,
      },
      historicalContext,
      webSearchContext: webCtx,
      analysisGoogleSearch: !noAnalysisSearch,
      analysisQuotaFallback: false,
    };

    const runArm = async (model: string) => {
      const t = Date.now();
      const res = await analyzeJobAdvanced({ ...base, analysisModel: model });
      const ms = Date.now() - t;
      return { res, ms };
    };

    const [a, b] = await Promise.all([runArm(armA), runArm(armB)]);

    if (jsonMode) {
      console.log(
        JSON.stringify({
          jobId: job.id,
          title: job.title,
          armA: { model: armA, ms: a.ms, result: a.res },
          armB: { model: armB, ms: b.ms, result: b.res },
        })
      );
      continue;
    }

    const printShort = (label: string, ms: number, r: AdvancedAnalyzeResult | null) => {
      if (!r) {
        console.log("  " + label + ": FAILED (" + ms + "ms)");
        return;
      }
      console.log(
        "  " +
          label +
          ": " +
          ms +
          "ms | " +
          r.category +
          " | novelty=" +
          r.novelty_score +
          " | exec=" +
          r.is_executive_movement
      );
      console.log("    headline: " + r.headline);
    };

    console.log("── " + job.title + " (" + job.id + ") ──");
    printShort(armA, a.ms, a.res);
    printShort(armB, b.ms, b.res);

    if (a.res && b.res) {
      if (a.res.category === b.res.category) catMatch++;
      if (a.res.is_executive_movement === b.res.is_executive_movement) execMatch++;
      jaccardSum += jaccard(a.res.strategic_signals, b.res.strategic_signals);
      const jac = jaccard(a.res.strategic_signals, b.res.strategic_signals);
      console.log(
        "  agreement: category=" +
          (a.res.category === b.res.category) +
          " | signals_jaccard=" +
          jac.toFixed(2) +
          " | |novelty_delta|=" +
          Math.abs(a.res.novelty_score - b.res.novelty_score)
      );
    }
    console.log("");
  }

  if (!jsonMode && jobs.length > 0) {
    console.log("──────── Summary ────────");
    const withBoth = jobs.length;
    console.log(
      "  category match rate: " + catMatch + "/" + withBoth + " (" + ((catMatch / withBoth) * 100).toFixed(0) + "%)"
    );
    console.log("  executive flag match: " + execMatch + "/" + withBoth);
    console.log("  mean signals Jaccard: " + (jaccardSum / withBoth).toFixed(2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
