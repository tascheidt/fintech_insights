/**
 * model-bakeoff — run a scenario across multiple models (Gemini baseline +
 * open-model candidates via Fireworks), score output agreement, and emit a
 * cost + quality comparison artifact + markdown report.
 *
 * This is the evaluation-only sibling of `gemini-compare.ts`: it drives the
 * SAME production functions/prompts through each model (via the eval seam in
 * structure.ts / categorizer.ts) so results reflect production, not a re-prompt.
 *
 * Usage:
 *   cd web
 *   npx tsx --env-file=.env.local scripts/model-bakeoff.ts \
 *     --scenario=extract-structure \
 *     --models=gemini-flash-latest,glm-5.2,deepseek-v4-flash
 *
 *   # Score against a human-labeled golden set instead of the Gemini output:
 *   npx tsx --env-file=.env.local scripts/model-bakeoff.ts \
 *     --scenario=extract-structure --models=glm-5.2,deepseek-v4-flash --reference=golden
 *
 * Flags:
 *   --scenario=extract-structure | categorize
 *   --models=<csv>        Comma-separated model ids. First is the default
 *                         reference (unless --reference is given).
 *                         Gemini ids route to Gemini; eval ids (glm-5.2,
 *                         deepseek-v4-flash) route to Fireworks.
 *   --reference=<id|golden>  What to score agreement against. Default: first model.
 *   --limit=N             Cap jobs processed (default: all fixture jobs).
 *   --dry-run             Skip API calls; emit the artifact skeleton.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { execSync } from "child_process";

import { extractJobStructure, type JobStructureForDB } from "@/lib/analysis/structure";
import { categorizePosting, type JobCategoryResult } from "@/lib/analysis/categorizer";
import { DEFAULT_JOB_STRUCTURE_AI_CONFIG, type AllowedAiModel } from "@/lib/ai/prompt-config";
import type { UsageRecord } from "@/lib/ai/gemini-meter";
import {
  scoreExtraction,
  scoreCategorization,
  type ExtractionAgreement,
  type CategorizationAgreement,
} from "@/lib/ai/eval/agreement";

type Scenario = "extract-structure" | "categorize";
type Output = JobStructureForDB | JobCategoryResult | null;

interface Flags {
  scenario: Scenario;
  models: string[];
  reference: string; // model id or "golden"
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

interface PerJob {
  jobId: string;
  title: string;
  companySlug: string;
  output: Output;
  calls: UsageRecord[];
  errorMessage?: string;
}

interface ModelRun {
  model: string;
  perJob: PerJob[];
}

function parseFlags(argv: string[]): Flags {
  let scenario: Scenario | null = null;
  let models: string[] = [];
  let reference: string | null = null;
  let limit: number | null = null;
  let dryRun = false;

  for (const a of argv) {
    if (a.startsWith("--scenario=")) {
      const v = a.slice("--scenario=".length);
      if (v !== "extract-structure" && v !== "categorize") throw new Error(`Unknown scenario: ${v}`);
      scenario = v;
    } else if (a.startsWith("--models=")) {
      models = a
        .slice("--models=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a.startsWith("--reference=")) {
      reference = a.slice("--reference=".length);
    } else if (a.startsWith("--limit=")) {
      limit = Math.max(1, parseInt(a.slice("--limit=".length), 10) || 0);
    } else if (a === "--dry-run") {
      dryRun = true;
    }
  }

  if (!scenario) throw new Error("Missing --scenario (extract-structure | categorize).");
  if (models.length === 0) {
    models = ["gemini-flash-latest", "glm-5.2", "deepseek-v4-flash"];
  }
  return { scenario, models, reference: reference ?? models[0], limit, dryRun };
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
  const parsed = JSON.parse(raw) as { jobs: FixtureJob[] };
  return { jobs: parsed.jobs, fixtureFile };
}

async function loadGolden(): Promise<Map<string, JobStructureForDB>> {
  const file = resolve(process.cwd(), "scripts/fixtures/golden-extraction.json");
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { records: { jobId: string; expected: JobStructureForDB }[] };
    if (!parsed.records?.length) {
      throw new Error(
        `${file} has no records. Author the golden set first — open scripts/golden-labeler.html ` +
        `(regenerate it with: npx tsx scripts/build-golden-labeler.ts), label the jobs, and download ` +
        `the file back to scripts/fixtures/golden-extraction.json.`
      );
    }
    return new Map(parsed.records.map((r) => [r.jobId, r.expected]));
  } catch (err) {
    if (err instanceof Error && err.message.includes("has no records")) throw err;
    throw new Error(
      `--reference=golden requires ${file}. Author it via scripts/golden-labeler.html ` +
      `(see: npx tsx scripts/build-golden-labeler.ts).`
    );
  }
}

async function loadGoldenCategorize(): Promise<Map<string, JobCategoryResult>> {
  const file = resolve(process.cwd(), "scripts/fixtures/golden-categorize.json");
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { records: { jobId: string; expected: JobCategoryResult }[] };
    if (!parsed.records?.length) throw new Error(`${file} has no records.`);
    return new Map(parsed.records.map((r) => [r.jobId, r.expected]));
  } catch (err) {
    if (err instanceof Error && err.message.includes("has no records")) throw err;
    throw new Error(
      `--reference=golden (categorize) requires ${file} with human-verified records.`
    );
  }
}

async function runScenarioForModel(
  jobs: FixtureJob[],
  model: string,
  scenario: Scenario,
  dryRun: boolean
): Promise<ModelRun> {
  const perJob: PerJob[] = [];
  for (const job of jobs) {
    const calls: UsageRecord[] = [];
    console.error(`[${model}] ${scenario} ${job.company_slug}/${job.id} — ${job.title}`);
    if (dryRun) {
      perJob.push({ jobId: job.id, title: job.title, companySlug: job.company_slug, output: null, calls });
      continue;
    }
    try {
      let output: Output;
      if (scenario === "extract-structure") {
        const config = { ...DEFAULT_JOB_STRUCTURE_AI_CONFIG, model: model as AllowedAiModel };
        output = await extractJobStructure(job.title, job.description_text, job.department, {
          config,
          onUsage: (u) => calls.push({ ...u, extra: { ...u.extra, jobId: job.id } }),
        });
      } else {
        output = await categorizePosting(job.title, job.company_name, job.description_text, {
          model,
          onUsage: (u) => calls.push({ ...u, extra: { ...u.extra, jobId: job.id } }),
        });
      }
      perJob.push({ jobId: job.id, title: job.title, companySlug: job.company_slug, output, calls });
    } catch (err) {
      perJob.push({
        jobId: job.id,
        title: job.title,
        companySlug: job.company_slug,
        output: null,
        calls,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { model, perJob };
}

interface CostSummary {
  jobs: number;
  jsonOk: number;
  jsonOkPct: number;
  calls: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgTotalTokens: number;
  estimatedUsd: number;
  usdPerJob: number;
  usdPer1k: number;
  avgLatencyMs: number;
}

function summarizeCost(run: ModelRun): CostSummary {
  const jobs = run.perJob.length;
  const jsonOk = run.perJob.filter((p) => p.output !== null).length;
  const all = run.perJob.flatMap((p) => p.calls);
  const calls = all.length;
  const sum = (sel: (u: UsageRecord) => number) => all.reduce((acc, u) => acc + sel(u), 0);
  const input = sum((u) => u.inputTokens);
  const output = sum((u) => u.outputTokens);
  const total = sum((u) => u.totalTokens);
  const usd = sum((u) => u.estimatedUsd);
  const latency = sum((u) => u.latencyMs);
  return {
    jobs,
    jsonOk,
    jsonOkPct: jobs ? jsonOk / jobs : 0,
    calls,
    avgInputTokens: calls ? Math.round(input / calls) : 0,
    avgOutputTokens: calls ? Math.round(output / calls) : 0,
    avgTotalTokens: calls ? Math.round(total / calls) : 0,
    estimatedUsd: Number(usd.toFixed(6)),
    usdPerJob: jobs ? Number((usd / jobs).toFixed(6)) : 0,
    usdPer1k: jobs ? Number(((usd / jobs) * 1000).toFixed(4)) : 0,
    avgLatencyMs: calls ? Math.round(latency / calls) : 0,
  };
}

interface ExtractionAgreementSummary {
  scored: number;
  meanL1: number;
  meanSummarySim: number;
  perField: Record<string, number>;
}

function summarizeExtractionAgreement(
  run: ModelRun,
  reference: Map<string, JobStructureForDB>
): ExtractionAgreementSummary {
  const perFieldTotals: Record<string, { sum: number; n: number }> = {};
  let l1Sum = 0;
  let simSum = 0;
  let scored = 0;
  for (const p of run.perJob) {
    const ref = reference.get(p.jobId);
    if (!ref || p.output === null) continue;
    const a: ExtractionAgreement = scoreExtraction(p.output as JobStructureForDB, ref);
    scored += 1;
    l1Sum += a.l1Agreement;
    simSum += a.summarySimilarity;
    for (const f of a.fields) {
      const t = (perFieldTotals[f.field] ??= { sum: 0, n: 0 });
      t.sum += f.score;
      t.n += 1;
    }
  }
  const perField: Record<string, number> = {};
  for (const [k, v] of Object.entries(perFieldTotals)) perField[k] = v.n ? v.sum / v.n : 0;
  return {
    scored,
    meanL1: scored ? l1Sum / scored : 0,
    meanSummarySim: scored ? simSum / scored : 0,
    perField,
  };
}

interface CategorizationAgreementSummary {
  scored: number;
  meanRoleCategory: number;
  meanSections: number;
  meanQuality: number;
}

function summarizeCategorizationAgreement(
  run: ModelRun,
  reference: Map<string, JobCategoryResult>
): CategorizationAgreementSummary {
  let roleSum = 0;
  let secSum = 0;
  let qSum = 0;
  let scored = 0;
  for (const p of run.perJob) {
    const ref = reference.get(p.jobId);
    if (!ref || p.output === null) continue;
    const a: CategorizationAgreement = scoreCategorization(p.output as JobCategoryResult, ref);
    scored += 1;
    roleSum += a.roleCategoryMatch;
    secSum += a.sectionsScore;
    qSum += a.qualityAgreement;
  }
  return {
    scored,
    meanRoleCategory: scored ? roleSum / scored : 0,
    meanSections: scored ? secSum / scored : 0,
    meanQuality: scored ? qSum / scored : 0,
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
function usd(n: number): string {
  return `$${n.toFixed(6)}`;
}

function renderMarkdown(args: {
  scenario: Scenario;
  reference: string;
  gitSha: string;
  fixtureCount: number;
  runs: ModelRun[];
  cost: Record<string, CostSummary>;
  extractionAgreement?: Record<string, ExtractionAgreementSummary>;
  categorizationAgreement?: Record<string, CategorizationAgreementSummary>;
}): string {
  const lines: string[] = [];
  lines.push(`# model-bakeoff: ${args.scenario}`);
  lines.push("");
  lines.push(`- git sha: \`${args.gitSha}\``);
  lines.push(`- generated: ${new Date().toISOString()}`);
  lines.push(`- fixture jobs: ${args.fixtureCount}`);
  lines.push(`- reference (agreement baseline): \`${args.reference}\``);
  lines.push("");

  lines.push(`## Cost & reliability`);
  lines.push("");
  lines.push("| model | jobs | JSON ok | avg in-tok | avg out-tok | $/job | $/1k jobs | avg latency |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const run of args.runs) {
    const c = args.cost[run.model];
    lines.push(
      `| \`${run.model}\` | ${c.jobs} | ${pct(c.jsonOkPct)} | ${c.avgInputTokens.toLocaleString()} | ${c.avgOutputTokens.toLocaleString()} | ${usd(c.usdPerJob)} | $${c.usdPer1k.toFixed(4)} | ${c.avgLatencyMs} ms |`
    );
  }
  lines.push("");

  if (args.scenario === "extract-structure" && args.extractionAgreement) {
    lines.push(`## Output agreement vs \`${args.reference}\``);
    lines.push("");
    lines.push("| model | scored | L1 agreement | summary sim | seniority | dept | function | salary | location | tech | keywords |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
    for (const run of args.runs) {
      const a = args.extractionAgreement[run.model];
      if (!a) continue;
      const f = a.perField;
      lines.push(
        `| \`${run.model}\` | ${a.scored} | **${pct(a.meanL1)}** | ${pct(a.meanSummarySim)} | ${pct(f.seniority_level ?? 0)} | ${pct(f.standardized_department ?? 0)} | ${pct(f.function_category ?? 0)} | ${pct(f.salary ?? 0)} | ${pct(f.location ?? 0)} | ${pct(f.tech_stack ?? 0)} | ${pct(f.keywords ?? 0)} |`
      );
    }
    lines.push("");
    lines.push(
      `> L1 agreement = mean over the categorical/structured fields (seniority, dept, function, salary, location, tech_stack, keywords). The "≥95% L1" gate in the docs applies here. Summary similarity is reported but excluded from the gate (stylistic, not correctness).`
    );
    lines.push("");
  }

  if (args.scenario === "categorize" && args.categorizationAgreement) {
    lines.push(`## Output agreement vs \`${args.reference}\``);
    lines.push("");
    lines.push("| model | scored | role-category | sections | quality |");
    lines.push("|---|---|---|---|---|");
    for (const run of args.runs) {
      const a = args.categorizationAgreement[run.model];
      if (!a) continue;
      lines.push(
        `| \`${run.model}\` | ${a.scored} | **${pct(a.meanRoleCategory)}** | ${pct(a.meanSections)} | ${pct(a.meanQuality)} |`
      );
    }
    lines.push("");
  }

  lines.push(`## Notes`);
  lines.push(
    `- Agreement against a model baseline measures *similarity to that model*, not ground truth. Use \`--reference=golden\` (a human-labeled set) to measure correctness.`
  );
  lines.push(`- Costs are sticker-rate estimates from \`gemini-pricing.ts\`; reconcile vs the Fireworks invoice.`);
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const { jobs: allJobs, fixtureFile } = await loadFixture();
  const jobs = flags.limit ? allJobs.slice(0, flags.limit) : allJobs;

  console.error(
    `scenario=${flags.scenario} models=${flags.models.join(",")} reference=${flags.reference} jobs=${jobs.length}`
  );

  const runs: ModelRun[] = [];
  for (const model of flags.models) {
    runs.push(await runScenarioForModel(jobs, model, flags.scenario, flags.dryRun));
  }

  const cost: Record<string, CostSummary> = {};
  for (const run of runs) cost[run.model] = summarizeCost(run);

  // Build the reference output map.
  let extractionAgreement: Record<string, ExtractionAgreementSummary> | undefined;
  let categorizationAgreement: Record<string, CategorizationAgreementSummary> | undefined;

  if (!flags.dryRun) {
    if (flags.scenario === "extract-structure") {
      let refMap: Map<string, JobStructureForDB>;
      if (flags.reference === "golden") {
        refMap = await loadGolden();
      } else {
        const refRun = runs.find((r) => r.model === flags.reference);
        refMap = new Map(
          (refRun?.perJob ?? [])
            .filter((p) => p.output !== null)
            .map((p) => [p.jobId, p.output as JobStructureForDB])
        );
      }
      extractionAgreement = {};
      for (const run of runs) extractionAgreement[run.model] = summarizeExtractionAgreement(run, refMap);
    } else {
      let refMap: Map<string, JobCategoryResult>;
      if (flags.reference === "golden") {
        refMap = await loadGoldenCategorize();
      } else {
        const refRun = runs.find((r) => r.model === flags.reference);
        refMap = new Map(
          (refRun?.perJob ?? [])
            .filter((p) => p.output !== null)
            .map((p) => [p.jobId, p.output as JobCategoryResult])
        );
      }
      categorizationAgreement = {};
      for (const run of runs)
        categorizationAgreement[run.model] = summarizeCategorizationAgreement(run, refMap);
    }
  }

  const sha = gitSha();
  const artifact = {
    scenario: flags.scenario,
    reference: flags.reference,
    gitSha: sha,
    generatedAt: new Date().toISOString(),
    fixtureFile,
    fixtureCount: jobs.length,
    models: flags.models,
    cost,
    extractionAgreement,
    categorizationAgreement,
    runs,
  };

  const artifactDir = resolve(process.cwd(), "scripts/artifacts");
  await mkdir(artifactDir, { recursive: true });
  const modelSuffix = flags.models.map((m) => m.replace(/[^a-z0-9]/gi, "_")).join("-vs-");
  const artifactPath = resolve(artifactDir, `bakeoff-${flags.scenario}-${modelSuffix}-${sha}.json`);
  await writeFile(artifactPath, JSON.stringify(artifact, null, 2));
  console.error(`\nartifact: ${artifactPath}`);

  console.log(
    renderMarkdown({
      scenario: flags.scenario,
      reference: flags.reference,
      gitSha: sha,
      fixtureCount: jobs.length,
      runs,
      cost,
      extractionAgreement,
      categorizationAgreement,
    })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
