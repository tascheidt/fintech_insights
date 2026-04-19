/**
 * gemini-compare — run a scenario against the committed fixture,
 * capture per-call token usage via the production analysis functions'
 * `onUsage` hook, and emit a JSON artifact + markdown report.
 *
 * Phase 1 scope is *baselines*: run the current production flow once
 * against the fixture and write an artifact that later PRs can diff
 * against. Cross-model sweeps and optimization-specific comparisons
 * arrive in later phases (2: hash gate; 3: drop prefetch; 4: Flash-lite).
 *
 * Usage:
 *   cd web
 *   npx tsx --env-file=.env.local scripts/gemini-compare.ts \
 *     --scenario=extract-structure --mode=baseline
 *   npx tsx --env-file=.env.local scripts/gemini-compare.ts \
 *     --scenario=analyze-advanced --mode=baseline --limit=10
 *
 * Flags:
 *   --scenario=extract-structure | analyze-advanced
 *   --mode=baseline                  (compare mode ships with Phase 2)
 *   --limit=N                        Cap jobs processed (defaults: 20 for extract, 10 for analyze)
 *   --dry-run                        Skip Gemini calls; still emits the artifact skeleton
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { execSync } from "child_process";

import { extractJobStructure, type JobStructureForDB } from "@/lib/analysis/structure";
import { analyzeJobAdvanced, type AdvancedAnalyzeResult } from "@/lib/analysis/advanced-strategic";
import type { UsageRecord } from "@/lib/ai/gemini-meter";

type Scenario = "extract-structure" | "analyze-advanced";
type Mode = "baseline";

interface Flags {
  scenario: Scenario;
  mode: Mode;
  limit: number | null;
  dryRun: boolean;
}

interface FixtureJob {
  id: string;
  title: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  department: string | null;
  location: string | null;
  description_text: string;
}

interface PerJobResult {
  jobId: string;
  title: string;
  companySlug: string;
  calls: UsageRecord[];
  output: JobStructureForDB | AdvancedAnalyzeResult | null;
  errorMessage?: string;
}

interface Artifact {
  scenario: Scenario;
  mode: Mode;
  gitSha: string;
  generatedAt: string;
  fixtureFile: string;
  fixtureCount: number;
  processedCount: number;
  totals: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    totalTokens: number;
    estimatedUsd: number;
    avgLatencyMs: number;
  };
  byCallSite: Record<
    string,
    {
      calls: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedUsd: number;
      avgLatencyMs: number;
      modelsServed: string[];
    }
  >;
  perJob: PerJobResult[];
}

function parseFlags(argv: string[]): Flags {
  let scenario: Scenario | null = null;
  let mode: Mode = "baseline";
  let limit: number | null = null;
  let dryRun = false;

  for (const a of argv) {
    if (a.startsWith("--scenario=")) {
      const v = a.slice("--scenario=".length);
      if (v !== "extract-structure" && v !== "analyze-advanced") {
        throw new Error(`Unknown scenario: ${v}`);
      }
      scenario = v;
    } else if (a.startsWith("--mode=")) {
      const v = a.slice("--mode=".length);
      if (v !== "baseline") {
        throw new Error(`Unknown mode: ${v} (compare mode ships with Phase 2)`);
      }
      mode = v;
    } else if (a.startsWith("--limit=")) {
      limit = Math.max(1, parseInt(a.slice("--limit=".length), 10) || 0);
    } else if (a === "--dry-run") {
      dryRun = true;
    }
  }

  if (!scenario) {
    throw new Error(
      "Missing --scenario. Use --scenario=extract-structure or --scenario=analyze-advanced."
    );
  }

  return { scenario, mode, limit, dryRun };
}

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function loadFixture(): Promise<{ jobs: FixtureJob[]; fixtureFile: string }> {
  const fixtureFile = resolve(process.cwd(), "scripts/fixtures/gemini-sample-jobs.json");
  const raw = await readFile(fixtureFile, "utf8");
  const parsed = JSON.parse(raw) as { jobs: FixtureJob[]; count: number };
  return { jobs: parsed.jobs, fixtureFile };
}

function aggregate(usages: UsageRecord[]) {
  const totals = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    totalTokens: 0,
    estimatedUsd: 0,
    totalLatencyMs: 0,
  };
  const byCallSite: Artifact["byCallSite"] = {};

  for (const u of usages) {
    totals.calls += 1;
    totals.inputTokens += u.inputTokens;
    totals.outputTokens += u.outputTokens;
    totals.cachedTokens += u.cachedTokens;
    totals.totalTokens += u.totalTokens;
    totals.estimatedUsd += u.estimatedUsd;
    totals.totalLatencyMs += u.latencyMs;

    const siteKey = u.groundingEnabled ? `${u.callSite}+grounding` : u.callSite;
    const bucket = byCallSite[siteKey] ?? {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedUsd: 0,
      avgLatencyMs: 0,
      modelsServed: [] as string[],
    };
    bucket.calls += 1;
    bucket.inputTokens += u.inputTokens;
    bucket.outputTokens += u.outputTokens;
    bucket.totalTokens += u.totalTokens;
    bucket.estimatedUsd += u.estimatedUsd;
    bucket.avgLatencyMs += u.latencyMs;
    if (!bucket.modelsServed.includes(u.modelServed)) {
      bucket.modelsServed.push(u.modelServed);
    }
    byCallSite[siteKey] = bucket;
  }

  for (const key of Object.keys(byCallSite)) {
    const b = byCallSite[key];
    b.avgLatencyMs = b.calls > 0 ? Math.round(b.avgLatencyMs / b.calls) : 0;
  }

  return {
    totals: {
      calls: totals.calls,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      cachedTokens: totals.cachedTokens,
      totalTokens: totals.totalTokens,
      estimatedUsd: Number(totals.estimatedUsd.toFixed(6)),
      avgLatencyMs: totals.calls > 0 ? Math.round(totals.totalLatencyMs / totals.calls) : 0,
    },
    byCallSite,
  };
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(6)}`;
}

function renderMarkdown(artifact: Artifact): string {
  const { totals, byCallSite } = artifact;
  const lines: string[] = [];
  lines.push(`# gemini-compare: ${artifact.scenario} (${artifact.mode})`);
  lines.push("");
  lines.push(`- git sha: \`${artifact.gitSha}\``);
  lines.push(`- generated: ${artifact.generatedAt}`);
  lines.push(
    `- fixture: \`${artifact.fixtureFile.split("/").slice(-2).join("/")}\` (${artifact.fixtureCount} jobs, processed ${artifact.processedCount})`
  );
  lines.push("");
  lines.push(`## Totals`);
  lines.push(`- calls: ${totals.calls}`);
  lines.push(`- input tokens: ${totals.inputTokens.toLocaleString()}`);
  lines.push(`- output tokens: ${totals.outputTokens.toLocaleString()}`);
  lines.push(`- total tokens: ${totals.totalTokens.toLocaleString()}`);
  lines.push(`- cached tokens: ${totals.cachedTokens.toLocaleString()}`);
  lines.push(`- estimated USD: **${fmtUsd(totals.estimatedUsd)}**`);
  lines.push(`- avg latency: ${totals.avgLatencyMs} ms`);
  lines.push("");
  lines.push(`## By call site`);
  lines.push("");
  lines.push("| call site | calls | avg in-tok | avg out-tok | total $ | avg latency | models served |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const [site, b] of Object.entries(byCallSite)) {
    const avgIn = b.calls > 0 ? Math.round(b.inputTokens / b.calls) : 0;
    const avgOut = b.calls > 0 ? Math.round(b.outputTokens / b.calls) : 0;
    lines.push(
      `| \`${site}\` | ${b.calls} | ${avgIn.toLocaleString()} | ${avgOut.toLocaleString()} | ${fmtUsd(b.estimatedUsd)} | ${b.avgLatencyMs} ms | ${b.modelsServed.join(", ")} |`
    );
  }
  lines.push("");
  lines.push(`## Projection`);
  const perJobAvgUsd = artifact.processedCount > 0 ? totals.estimatedUsd / artifact.processedCount : 0;
  lines.push(`- per-job avg cost on this scenario: ${fmtUsd(perJobAvgUsd)}`);
  lines.push("");
  return lines.join("\n");
}

async function runExtractStructure(
  jobs: FixtureJob[],
  flags: Flags
): Promise<PerJobResult[]> {
  const results: PerJobResult[] = [];
  const jobList = flags.limit ? jobs.slice(0, flags.limit) : jobs;

  for (const job of jobList) {
    const callsForJob: UsageRecord[] = [];
    console.error(`[extract] ${job.company_slug}/${job.id} — ${job.title}`);
    if (flags.dryRun) {
      results.push({
        jobId: job.id,
        title: job.title,
        companySlug: job.company_slug,
        calls: callsForJob,
        output: null,
      });
      continue;
    }
    try {
      const out = await extractJobStructure(job.title, job.description_text, job.department, {
        onUsage: (u) => callsForJob.push({ ...u, extra: { ...u.extra, jobId: job.id } }),
      });
      results.push({
        jobId: job.id,
        title: job.title,
        companySlug: job.company_slug,
        calls: callsForJob,
        output: out,
      });
    } catch (err) {
      results.push({
        jobId: job.id,
        title: job.title,
        companySlug: job.company_slug,
        calls: callsForJob,
        output: null,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

async function runAnalyzeAdvanced(
  jobs: FixtureJob[],
  flags: Flags
): Promise<PerJobResult[]> {
  const results: PerJobResult[] = [];
  const defaultLimit = 10;
  const jobList = jobs.slice(0, flags.limit ?? defaultLimit);

  for (const job of jobList) {
    const callsForJob: UsageRecord[] = [];
    console.error(`[analyze] ${job.company_slug}/${job.id} — ${job.title}`);
    if (flags.dryRun) {
      results.push({
        jobId: job.id,
        title: job.title,
        companySlug: job.company_slug,
        calls: callsForJob,
        output: null,
      });
      continue;
    }
    try {
      const out = await analyzeJobAdvanced({
        companyId: job.company_id,
        companyName: job.company_name,
        job: {
          title: job.title,
          standardized_department: job.department,
          location: job.location,
          description_text: job.description_text,
        },
        onUsage: (u) => callsForJob.push({ ...u, extra: { ...u.extra, jobId: job.id } }),
      });
      results.push({
        jobId: job.id,
        title: job.title,
        companySlug: job.company_slug,
        calls: callsForJob,
        output: out,
      });
    } catch (err) {
      results.push({
        jobId: job.id,
        title: job.title,
        companySlug: job.company_slug,
        calls: callsForJob,
        output: null,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));

  if (!process.env.GEMINI_API_KEY && !flags.dryRun) {
    console.error("GEMINI_API_KEY is required (or pass --dry-run).");
    process.exit(1);
  }

  const { jobs: fixtureJobs, fixtureFile } = await loadFixture();

  console.error(
    `scenario=${flags.scenario} mode=${flags.mode} fixture=${fixtureJobs.length} jobs limit=${flags.limit ?? "default"}`
  );

  const perJob: PerJobResult[] =
    flags.scenario === "extract-structure"
      ? await runExtractStructure(fixtureJobs, flags)
      : await runAnalyzeAdvanced(fixtureJobs, flags);

  const allUsages = perJob.flatMap((r) => r.calls);
  const { totals, byCallSite } = aggregate(allUsages);

  const artifact: Artifact = {
    scenario: flags.scenario,
    mode: flags.mode,
    gitSha: gitSha(),
    generatedAt: new Date().toISOString(),
    fixtureFile,
    fixtureCount: fixtureJobs.length,
    processedCount: perJob.length,
    totals,
    byCallSite,
    perJob,
  };

  const artifactDir = resolve(process.cwd(), "scripts/artifacts");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = resolve(
    artifactDir,
    `${flags.mode}-${flags.scenario}-${artifact.gitSha}.json`
  );
  await writeFile(artifactPath, JSON.stringify(artifact, null, 2));
  console.error(`\nartifact: ${artifactPath}`);

  console.log(renderMarkdown(artifact));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
