/**
 * Phase 4 quality check: diff two `extract-structure` artifacts (baseline
 * vs candidate) on the critical structured fields and on partial-extraction
 * rate. Writes a markdown summary and a JSON artifact.
 *
 * Does NOT call Gemini. Runs offline against two committed artifacts.
 *
 * Usage:
 *   cd web
 *   npx tsx scripts/diff-extract-artifacts.ts \
 *     --baseline=scripts/artifacts/baseline-extract-structure-ce4ff9a.json \
 *     --candidate=scripts/artifacts/baseline-extract-structure-gemini-flash-lite-latest-a689dae.json
 *
 * Acceptance (Phase 4 plan):
 *   - L1 agreement on function_category, seniority_level,
 *     standardized_department >=95%
 *   - partial-extraction rate not worse than baseline
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { execSync } from "child_process";

interface Output {
  summary?: string;
  seniority_level?: string;
  salary?: unknown;
  tech_stack?: string[];
  keywords?: string[];
  standardized_department?: string;
  function_category?: string;
  location_structured?: unknown;
}

interface PerJob {
  jobId: string;
  title: string;
  companySlug: string;
  calls: Array<{ inputTokens: number; outputTokens: number; estimatedUsd: number; extra?: Record<string, unknown> }>;
  output: Output | null;
  errorMessage?: string;
}

interface Artifact {
  scenario: string;
  totals: { calls: number; estimatedUsd: number; inputTokens: number; outputTokens: number; avgLatencyMs: number };
  processedCount: number;
  perJob: PerJob[];
  byCallSite: Record<string, { calls: number; modelsServed: string[] }>;
}

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Number(((n / d) * 100).toFixed(1));
}

function normalizeDept(s: string | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

function jaccard(a: string[] = [], b: string[] = []): number {
  const sa = new Set(a.map((x) => x.toLowerCase().trim()).filter(Boolean));
  const sb = new Set(b.map((x) => x.toLowerCase().trim()).filter(Boolean));
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

async function main() {
  const args = process.argv.slice(2);
  const baselineFlag = args.find((a) => a.startsWith("--baseline="));
  const candidateFlag = args.find((a) => a.startsWith("--candidate="));
  if (!baselineFlag || !candidateFlag) {
    console.error("Missing --baseline=<path> and/or --candidate=<path>.");
    process.exit(1);
  }
  const baselinePath = baselineFlag.slice("--baseline=".length);
  const candidatePath = candidateFlag.slice("--candidate=".length);

  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Artifact;
  const candidate = JSON.parse(await readFile(candidatePath, "utf8")) as Artifact;

  const baselineModel = Object.values(baseline.byCallSite)[0]?.modelsServed.join(",") ?? "unknown";
  const candidateModel = Object.values(candidate.byCallSite)[0]?.modelsServed.join(",") ?? "unknown";

  const baseByJob = new Map<string, PerJob>(baseline.perJob.map((p) => [p.jobId, p]));
  const candByJob = new Map<string, PerJob>(candidate.perJob.map((p) => [p.jobId, p]));
  const commonJobIds = [...baseByJob.keys()].filter((id) => candByJob.has(id));

  const stats = {
    function_category: { match: 0, total: 0 },
    seniority_level: { match: 0, total: 0 },
    standardized_department: { match: 0, total: 0 },
    tech_stack_jaccard_sum: 0,
    tech_stack_pairs: 0,
    keywords_jaccard_sum: 0,
    keywords_pairs: 0,
  };
  const partial = {
    baselineNullOutputs: 0,
    candidateNullOutputs: 0,
    baselineRetries: 0,
    candidateRetries: 0,
    baselineMissingCategory: 0,
    candidateMissingCategory: 0,
  };
  const perJobDiffs: Array<{
    jobId: string;
    title: string;
    companySlug: string;
    function_category: { baseline?: string; candidate?: string; match: boolean };
    seniority_level: { baseline?: string; candidate?: string; match: boolean };
    standardized_department: { baseline?: string; candidate?: string; match: boolean };
    tech_stack_jaccard: number;
    keywords_jaccard: number;
  }> = [];

  for (const jobId of commonJobIds) {
    const b = baseByJob.get(jobId)!;
    const c = candByJob.get(jobId)!;

    if (b.output === null) partial.baselineNullOutputs++;
    if (c.output === null) partial.candidateNullOutputs++;
    // Retries: any call after the first on the same job
    if (b.calls.length > 1) partial.baselineRetries += b.calls.length - 1;
    if (c.calls.length > 1) partial.candidateRetries += c.calls.length - 1;

    const bo = b.output ?? {};
    const co = c.output ?? {};

    if (!bo.function_category) partial.baselineMissingCategory++;
    if (!co.function_category) partial.candidateMissingCategory++;

    // Categories
    if (bo.function_category || co.function_category) {
      stats.function_category.total++;
      if (bo.function_category === co.function_category) stats.function_category.match++;
    }
    if (bo.seniority_level || co.seniority_level) {
      stats.seniority_level.total++;
      if (bo.seniority_level === co.seniority_level) stats.seniority_level.match++;
    }
    if (bo.standardized_department || co.standardized_department) {
      stats.standardized_department.total++;
      if (normalizeDept(bo.standardized_department) === normalizeDept(co.standardized_department))
        stats.standardized_department.match++;
    }

    const tj = jaccard(bo.tech_stack, co.tech_stack);
    const kj = jaccard(bo.keywords, co.keywords);
    if (bo.tech_stack || co.tech_stack) {
      stats.tech_stack_jaccard_sum += tj;
      stats.tech_stack_pairs++;
    }
    if (bo.keywords || co.keywords) {
      stats.keywords_jaccard_sum += kj;
      stats.keywords_pairs++;
    }

    perJobDiffs.push({
      jobId,
      title: b.title,
      companySlug: b.companySlug,
      function_category: {
        baseline: bo.function_category,
        candidate: co.function_category,
        match: bo.function_category === co.function_category,
      },
      seniority_level: {
        baseline: bo.seniority_level,
        candidate: co.seniority_level,
        match: bo.seniority_level === co.seniority_level,
      },
      standardized_department: {
        baseline: bo.standardized_department,
        candidate: co.standardized_department,
        match:
          normalizeDept(bo.standardized_department) === normalizeDept(co.standardized_department),
      },
      tech_stack_jaccard: Number(tj.toFixed(2)),
      keywords_jaccard: Number(kj.toFixed(2)),
    });
  }

  const costDeltaUsd = candidate.totals.estimatedUsd - baseline.totals.estimatedUsd;
  const costPercentChange =
    baseline.totals.estimatedUsd > 0
      ? (costDeltaUsd / baseline.totals.estimatedUsd) * 100
      : 0;
  const latencyPercentChange =
    baseline.totals.avgLatencyMs > 0
      ? ((candidate.totals.avgLatencyMs - baseline.totals.avgLatencyMs) /
          baseline.totals.avgLatencyMs) *
        100
      : 0;

  const l1Pass =
    pct(stats.function_category.match, stats.function_category.total) >= 95 &&
    pct(stats.seniority_level.match, stats.seniority_level.total) >= 95 &&
    pct(stats.standardized_department.match, stats.standardized_department.total) >= 95;
  const partialPass =
    partial.candidateNullOutputs <= partial.baselineNullOutputs &&
    partial.candidateMissingCategory <= partial.baselineMissingCategory;

  const report = {
    baseline: {
      path: baselinePath,
      model: baselineModel,
      totals: baseline.totals,
      processedCount: baseline.processedCount,
    },
    candidate: {
      path: candidatePath,
      model: candidateModel,
      totals: candidate.totals,
      processedCount: candidate.processedCount,
    },
    commonJobs: commonJobIds.length,
    stats,
    partial,
    cost: {
      deltaUsd: Number(costDeltaUsd.toFixed(6)),
      percentChange: Number(costPercentChange.toFixed(2)),
    },
    latency: {
      deltaMs: candidate.totals.avgLatencyMs - baseline.totals.avgLatencyMs,
      percentChange: Number(latencyPercentChange.toFixed(1)),
    },
    acceptance: {
      l1AgreementGte95: l1Pass,
      partialExtractionNotWorse: partialPass,
      overall: l1Pass && partialPass,
    },
    perJobDiffs,
  };

  const outDir = resolve(process.cwd(), "scripts/artifacts");
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, `diff-extract-${gitSha()}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));

  // Markdown
  const lines: string[] = [];
  lines.push(`# extract-structure diff: baseline vs candidate`);
  lines.push("");
  lines.push(
    `- baseline: \`${baselinePath.split("/").slice(-2).join("/")}\` (model: ${baselineModel})`
  );
  lines.push(
    `- candidate: \`${candidatePath.split("/").slice(-2).join("/")}\` (model: ${candidateModel})`
  );
  lines.push(`- common jobs: ${commonJobIds.length}`);
  lines.push("");
  lines.push(`## Cost + latency`);
  lines.push(
    `- baseline: ${baseline.totals.calls} calls, $${baseline.totals.estimatedUsd.toFixed(6)}, ${baseline.totals.avgLatencyMs} ms avg`
  );
  lines.push(
    `- candidate: ${candidate.totals.calls} calls, $${candidate.totals.estimatedUsd.toFixed(6)}, ${candidate.totals.avgLatencyMs} ms avg`
  );
  lines.push(
    `- cost delta: $${costDeltaUsd.toFixed(6)} (**${costPercentChange.toFixed(1)}%**)`
  );
  lines.push(
    `- latency delta: ${candidate.totals.avgLatencyMs - baseline.totals.avgLatencyMs} ms (${latencyPercentChange.toFixed(1)}%)`
  );
  lines.push("");
  lines.push(`## L1 — structured-field agreement`);
  lines.push("");
  lines.push("| field | match / total | agreement | threshold |");
  lines.push("|---|---|---|---|");
  lines.push(
    `| function_category | ${stats.function_category.match} / ${stats.function_category.total} | **${pct(stats.function_category.match, stats.function_category.total)}%** | ≥95% |`
  );
  lines.push(
    `| seniority_level | ${stats.seniority_level.match} / ${stats.seniority_level.total} | **${pct(stats.seniority_level.match, stats.seniority_level.total)}%** | ≥95% |`
  );
  lines.push(
    `| standardized_department (case-insensitive) | ${stats.standardized_department.match} / ${stats.standardized_department.total} | **${pct(stats.standardized_department.match, stats.standardized_department.total)}%** | ≥95% |`
  );
  lines.push(
    `| tech_stack jaccard | ${stats.tech_stack_pairs} pairs | avg ${(stats.tech_stack_jaccard_sum / Math.max(1, stats.tech_stack_pairs)).toFixed(2)} | — |`
  );
  lines.push(
    `| keywords jaccard | ${stats.keywords_pairs} pairs | avg ${(stats.keywords_jaccard_sum / Math.max(1, stats.keywords_pairs)).toFixed(2)} | — |`
  );
  lines.push(`- L1 acceptance (critical fields ≥95%): ${l1Pass ? "**PASS**" : "**FAIL**"}`);
  lines.push("");
  lines.push(`## Partial-extraction rate`);
  lines.push("");
  lines.push("| metric | baseline | candidate |");
  lines.push("|---|---|---|");
  lines.push(`| null outputs | ${partial.baselineNullOutputs} | ${partial.candidateNullOutputs} |`);
  lines.push(`| retries (calls beyond first per job) | ${partial.baselineRetries} | ${partial.candidateRetries} |`);
  lines.push(`| missing function_category | ${partial.baselineMissingCategory} | ${partial.candidateMissingCategory} |`);
  lines.push(`- acceptance (not worse than baseline): ${partialPass ? "**PASS**" : "**FAIL**"}`);
  lines.push("");
  lines.push(`## Per-job field diffs`);
  lines.push("");
  lines.push("| company / title | function_category | seniority | department | tech jaccard | kw jaccard |");
  lines.push("|---|---|---|---|---|---|");
  for (const d of perJobDiffs) {
    const catCell = d.function_category.match
      ? "✓"
      : `${d.function_category.baseline ?? "—"} → ${d.function_category.candidate ?? "—"}`;
    const senCell = d.seniority_level.match
      ? "✓"
      : `${d.seniority_level.baseline ?? "—"} → ${d.seniority_level.candidate ?? "—"}`;
    const deptCell = d.standardized_department.match
      ? "✓"
      : `${d.standardized_department.baseline ?? "—"} → ${d.standardized_department.candidate ?? "—"}`;
    const title = `${d.companySlug} / ${d.title}`.slice(0, 70);
    lines.push(
      `| ${title} | ${catCell} | ${senCell} | ${deptCell} | ${d.tech_stack_jaccard} | ${d.keywords_jaccard} |`
    );
  }
  lines.push("");
  lines.push(`**Overall acceptance: ${report.acceptance.overall ? "**PASS**" : "**FAIL**"}**`);
  lines.push("");
  lines.push(`artifact: ${outPath}`);

  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
