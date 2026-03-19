import { createAdminClient } from "@/lib/supabase/admin";
import { extractJobStructure } from "@/lib/analysis/structure";
import {
  aggregateRoleThemes,
  buildWeeklyDigestCompanyInput,
  generateWeeklyDigestCommentary,
  getWeeklyData,
  type TLDRCommentary,
  type WeeklyDigestCompanyInput,
} from "@/lib/analysis/digest";
import { buildTechStackStrategicContext } from "@/lib/analysis/strategic-context";
import { enrichTechStackWithAnalysis, normalizeTechName, type CompanyTechStack } from "@/lib/ai/tech-stack-extraction";
import {
  AI_MODEL_OPTIONS,
  buildConfigVersion,
  getActiveJobStructureAiConfig,
  getActivePromptConfigs,
  getActiveTechStackAiConfig,
  getActiveWeeklyDigestAiConfig,
  type JobStructureAiConfig,
  type PromptStage,
  type TechStackAiConfig,
  type WeeklyDigestAiConfig,
} from "@/lib/ai/prompt-config";
import { aggregateTechStackFromJobs } from "@/lib/ai/tech-stack-aggregation";
import { createGitHubIssue, triggerCodeGenWorkflow } from "@/lib/github";
import { extractAndUpdateStructure } from "@/lib/jobs/processor";
import {
  JOB_STRUCTURE_BENCHMARKS,
  TECH_STACK_BENCHMARKS,
  WEEKLY_DIGEST_BENCHMARKS,
  scoreJobStructureBenchmark,
  scoreTechStackBenchmark,
  scoreWeeklyDigestBenchmark,
} from "./prompt-forge-benchmarks";

const GENERIC_TERMS = new Set([
  "api",
  "apis",
  "cloud",
  "database",
  "databases",
  "data pipeline",
  "pipelines",
  "microservices",
  "distributed systems",
  "analytics",
  "automation",
  "architecture",
  "security",
  "machine learning",
  "artificial intelligence",
  "ai",
  "etl",
]);

const FINTECH_SIGNAL_TERMS = [
  "temenos",
  "fis",
  "finastra",
  "mambu",
  "stripe",
  "plaid",
  "marqeta",
  "adyen",
  "fico",
  "nCino",
  "jack henry",
  "kyc",
  "aml",
  "snowflake",
  "databricks",
  "kafka",
];

const INSIGHT_TERMS = [
  "build-vs-buy",
  "vendor",
  "platform",
  "maturity",
  "regulated",
  "compliance",
  "payments",
  "banking",
  "observability",
  "data",
  "core",
  "risk",
  "fraud",
  "uncertainty",
  "limited",
  "appears",
  "suggests",
];

const GENERIC_PHRASES = [
  "modern tech stack",
  "focus on innovation",
  "strong technical foundation",
  "leverages data",
  "builds scalable systems",
];

export interface PromptForgeCompanyOption {
  id: string;
  name: string;
  slug: string;
}

export interface PromptForgeMetric {
  id: string;
  label: string;
  value: number;
  tone: "good" | "warn" | "bad";
  helper: string;
}

export interface PromptForgeBattleSummary {
  score: number;
  metrics: PromptForgeMetric[];
  latencyMs: number;
}

export interface JobStructurePreviewRow {
  jobId: string;
  title: string;
  currentTech: string[];
  candidateTech: string[];
  added: string[];
  removed: string[];
}

export interface TechStackCategoryPreview {
  category: string;
  label: string;
  technologies: string[];
  narrativeSummary?: string;
}

export interface WeeklyDigestPreview {
  headline: string;
  body: string;
}

export interface PromptForgeRunRecord {
  id: string;
  stage: PromptStage;
  arena: string;
  companyId: string;
  companyName: string;
  model: string;
  score: number;
  metrics: PromptForgeMetric[];
  createdAt: string;
  savedAsActive?: boolean;
  promotionIssueUrl?: string | null;
}

interface CompanyJobSample {
  id: string;
  title: string;
  description_text: string | null;
  department: string | null;
  tech_stack: string[] | null;
}

interface HistoricalContextSample {
  company_id: string;
  title: string;
  standardized_department: string | null;
  is_active: boolean;
  first_seen_date: string;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toneForScore(score: number): PromptForgeMetric["tone"] {
  if (score >= 75) return "good";
  if (score >= 50) return "warn";
  return "bad";
}

function getSpecificityMetrics(rows: string[][]): PromptForgeBattleSummary {
  const flattened = rows.flat();
  const unique = new Set(flattened.map((item) => item.toLowerCase()));
  const genericHits = flattened.filter((item) => GENERIC_TERMS.has(item.toLowerCase())).length;
  const fintechHits = flattened.filter((item) =>
    FINTECH_SIGNAL_TERMS.some((term) => item.toLowerCase().includes(term.toLowerCase()))
  ).length;
  const normalizedHits = flattened.filter((item) => normalizeTechName(item) === item).length;
  const avgPerJob = average(rows.map((row) => row.length));

  const specificity = flattened.length === 0 ? 0 : clampScore(((flattened.length - genericHits) / flattened.length) * 100);
  const fintechDepth = flattened.length === 0 ? 0 : clampScore((fintechHits / flattened.length) * 100 + Math.min(20, fintechHits * 4));
  const normalization = flattened.length === 0 ? 0 : clampScore((normalizedHits / flattened.length) * 100);
  const signalDensity = clampScore(Math.max(0, 100 - Math.abs(avgPerJob - 5) * 12));
  const diversity = flattened.length === 0 ? 0 : clampScore((unique.size / flattened.length) * 100);

  const metrics: PromptForgeMetric[] = [
    {
      id: "specificity",
      label: "Specificity",
      value: specificity,
      tone: toneForScore(specificity),
      helper: "Penalizes vague or generic technology labels.",
    },
    {
      id: "fintechDepth",
      label: "Fintech Depth",
      value: fintechDepth,
      tone: toneForScore(fintechDepth),
      helper: "Rewards named finance-specific vendors and systems.",
    },
    {
      id: "normalization",
      label: "Canonical Names",
      value: normalization,
      tone: toneForScore(normalization),
      helper: "Measures how often the output lands on normalized names.",
    },
    {
      id: "signalDensity",
      label: "Signal Density",
      value: signalDensity,
      tone: toneForScore(signalDensity),
      helper: "Rewards tight, high-signal lists rather than sparse or padded ones.",
    },
    {
      id: "diversity",
      label: "Diversity",
      value: diversity,
      tone: toneForScore(diversity),
      helper: "Checks whether the run surfaces a varied but coherent stack.",
    },
  ];

  return {
    score: clampScore(average(metrics.map((metric) => metric.value))),
    metrics,
    latencyMs: 0,
  };
}

function getNarrativeMetrics(
  inputTechCount: number,
  stack: CompanyTechStack
): PromptForgeBattleSummary {
  const categories = stack.categories ?? [];
  const categoryCount = categories.length;
  const categorizedTechCount = categories.reduce((sum, category) => sum + category.technologies.length, 0);
  const narrativeText = [
    stack.architectSummary ?? "",
    ...categories.map((category) => category.narrativeSummary ?? ""),
  ]
    .join(" ")
    .trim();

  const insightHits = INSIGHT_TERMS.filter((term) => narrativeText.toLowerCase().includes(term.toLowerCase())).length;
  const genericHits = GENERIC_PHRASES.filter((phrase) => narrativeText.toLowerCase().includes(phrase)).length;
  const uncertaintyHit = /(appears|suggests|likely|limited|uncertain|incomplete)/i.test(narrativeText);

  const coverage = inputTechCount === 0 ? 0 : clampScore((categorizedTechCount / inputTechCount) * 100);
  const depth = clampScore(Math.min(100, insightHits * 12 + Math.min(28, narrativeText.length / 18)));
  const categoryVariety = clampScore(Math.min(100, categoryCount * 22));
  const uncertainty = uncertaintyHit ? 85 : 45;
  const genericPenaltyAdjusted = clampScore(Math.max(0, 100 - genericHits * 28));

  const metrics: PromptForgeMetric[] = [
    {
      id: "coverage",
      label: "Coverage",
      value: coverage,
      tone: toneForScore(coverage),
      helper: "How much of the flat input list is reflected in the final stack.",
    },
    {
      id: "insightDepth",
      label: "Insight Depth",
      value: depth,
      tone: toneForScore(depth),
      helper: "Rewards substantive architecture and diligence language.",
    },
    {
      id: "categoryVariety",
      label: "Category Variety",
      value: categoryVariety,
      tone: toneForScore(categoryVariety),
      helper: "Encourages a nuanced stack split rather than one giant bucket.",
    },
    {
      id: "uncertainty",
      label: "Honest Uncertainty",
      value: uncertainty,
      tone: toneForScore(uncertainty),
      helper: "Looks for explicit handling of limitations in hiring-derived data.",
    },
    {
      id: "antiGeneric",
      label: "Anti-Generic",
      value: genericPenaltyAdjusted,
      tone: toneForScore(genericPenaltyAdjusted),
      helper: "Penalizes empty consultant-style phrasing.",
    },
  ];

  return {
    score: clampScore(average(metrics.map((metric) => metric.value))),
    metrics,
    latencyMs: 0,
  };
}

function getWeeklyDigestMetrics(
  input: WeeklyDigestCompanyInput,
  commentary: TLDRCommentary
): PromptForgeBattleSummary {
  const text = `${commentary.headline} ${commentary.body}`.toLowerCase();
  const roleMentions = input.weekly_role_themes.filter((theme) =>
    text.includes(theme.label.toLowerCase()) ||
    theme.sample_titles.some((title) => text.includes(title.toLowerCase()))
  ).length;
  const groundedCounts = [input.week_job_count, input.current_open_job_count, input.year_to_date_job_count]
    .filter((value) => text.includes(String(value))).length;
  const continuityWords =
    input.continuity === "continuing"
      ? /(continue|continuing|still|remain)/i.test(text)
      : input.continuity === "new_focus"
        ? /(new|first|shift|different)/i.test(text)
        : /(continue|continuing|still|remain|new|shift|different)/i.test(text);
  const hypeHits = ["pivot", "aggressive", "bets big", "dramatic", "signals a strategic", "transformative"].filter(
    (phrase) => text.includes(phrase)
  ).length;
  const simpleLanguage = commentary.body.length <= 360 ? 90 : 65;

  const roleFocus = clampScore((roleMentions / Math.max(1, input.weekly_role_themes.length)) * 100);
  const factualGrounding = clampScore(((groundedCounts * 30) + Math.min(40, input.sample_titles.length * 6)));
  const continuity = continuityWords ? 90 : 35;
  const antiHype = clampScore(Math.max(0, 100 - hypeHits * 35));

  const metrics: PromptForgeMetric[] = [
    {
      id: "roleFocus",
      label: "Role Focus",
      value: roleFocus,
      tone: toneForScore(roleFocus),
      helper: "Rewards outputs that stay anchored to role families and representative titles.",
    },
    {
      id: "factualGrounding",
      label: "Factual Grounding",
      value: factualGrounding,
      tone: toneForScore(factualGrounding),
      helper: "Looks for concrete counts and job evidence instead of abstract claims.",
    },
    {
      id: "continuityDetection",
      label: "Continuity Detection",
      value: continuity,
      tone: toneForScore(continuity),
      helper: "Checks whether the copy correctly distinguishes continuation from change.",
    },
    {
      id: "antiHype",
      label: "Anti-Hype",
      value: antiHype,
      tone: toneForScore(antiHype),
      helper: "Penalizes inflated strategic phrasing and overclaimed novelty.",
    },
    {
      id: "clarity",
      label: "Clarity",
      value: simpleLanguage,
      tone: toneForScore(simpleLanguage),
      helper: "Rewards shorter, plainer language that reads like a hiring brief.",
    },
  ];

  return {
    score: clampScore(average(metrics.map((metric) => metric.value))),
    metrics,
    latencyMs: 0,
  };
}

function configsMatch(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function scoreJobStructureBenchmarks(config: JobStructureAiConfig) {
  const scores = await Promise.all(
    JOB_STRUCTURE_BENCHMARKS.map(async (benchmark) => {
      const result = await extractJobStructure(
        benchmark.title,
        benchmark.description,
        benchmark.rawDepartment,
        { config }
      );
      return scoreJobStructureBenchmark(result?.tech_stack ?? [], benchmark);
    })
  );

  return clampScore(average(scores));
}

async function scoreTechStackBenchmarks(config: TechStackAiConfig) {
  const scores = await Promise.all(
    TECH_STACK_BENCHMARKS.map(async (benchmark) => {
      const result = await enrichTechStackWithAnalysis(
        benchmark.companyName,
        benchmark.technologies,
        benchmark.totalJobsAnalyzed,
        benchmark.periodStart,
        benchmark.periodEnd,
        benchmark.strategicContext ?? "No company strategic context is available.",
        config
      );
      return scoreTechStackBenchmark(result, benchmark);
    })
  );

  return clampScore(average(scores));
}

async function scoreWeeklyDigestBenchmarks(config: WeeklyDigestAiConfig) {
  const scores = await Promise.all(
    WEEKLY_DIGEST_BENCHMARKS.map(async (benchmark) => {
      const result = await generateWeeklyDigestCommentary(benchmark.input, config);
      return scoreWeeklyDigestBenchmark(result, benchmark);
    })
  );

  return clampScore(average(scores));
}

function getPreviousWeekStart() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - daysToMonday - 7);
  weekStart.setUTCHours(0, 0, 0, 0);
  return weekStart;
}

async function buildWeeklyDigestEvaluationInput(companyId: string): Promise<WeeklyDigestCompanyInput> {
  const supabase = createAdminClient();
  const weeklyData = await getWeeklyData(7);
  const companyData = weeklyData.get(companyId);
  if (!companyData) {
    throw new Error("No weekly digest data found for this company.");
  }

  const weekStart = getPreviousWeekStart();
  const yearStart = new Date(Date.UTC(weekStart.getUTCFullYear(), 0, 1, 0, 0, 0, 0));

  const [ytdResponse, activeResponse] = await Promise.all([
    supabase
      .from("job_postings")
      .select("company_id, title, standardized_department, is_active, first_seen_date")
      .eq("company_id", companyId)
      .gte("first_seen_date", yearStart.toISOString())
      .lt("first_seen_date", weekStart.toISOString()),
    supabase
      .from("job_postings")
      .select("company_id, title, standardized_department, is_active, first_seen_date")
      .eq("company_id", companyId)
      .eq("is_active", true),
  ]);

  if (ytdResponse.error) {
    throw new Error(ytdResponse.error.message);
  }

  if (activeResponse.error) {
    throw new Error(activeResponse.error.message);
  }

  const historicalContext = {
    currentOpenJobCount: (activeResponse.data ?? []).length,
    yearToDateJobCount: (ytdResponse.data ?? []).length,
    openRoleThemes: aggregateRoleThemes((activeResponse.data ?? []) as HistoricalContextSample[]),
    yearToDateRoleThemes: aggregateRoleThemes((ytdResponse.data ?? []) as HistoricalContextSample[]),
  };

  return buildWeeklyDigestCompanyInput(companyData, historicalContext);
}

export async function evaluateJobStructurePrompt(options: {
  companyId: string;
  companyName: string;
  sampleSize: number;
  arena: string;
  candidateConfig: JobStructureAiConfig;
}) {
  const supabase = createAdminClient();
  const { data: jobs, error } = await supabase
    .from("job_postings")
    .select("id, title, description_text, department, tech_stack")
    .eq("company_id", options.companyId)
    .not("description_text", "is", null)
    .order("first_seen_date", { ascending: false })
    .limit(options.sampleSize);

  if (error) {
    throw new Error(error.message);
  }

  const sampleJobs = (jobs ?? []).filter(
    (job) => typeof job.description_text === "string" && job.description_text.trim().length > 50
  ) as CompanyJobSample[];

  if (sampleJobs.length === 0) {
    throw new Error("No job descriptions available for this company.");
  }

  const baselineConfig = await getActiveJobStructureAiConfig();
  const baselineStart = Date.now();
  const baselineResults = configsMatch(baselineConfig, options.candidateConfig)
    ? await Promise.all(
        sampleJobs.map(async (job) => ({
          jobId: job.id,
          title: job.title,
          tech: (job.tech_stack ?? []).map(String),
        }))
      )
    : await Promise.all(
        sampleJobs.map(async (job) => {
          const result = await extractJobStructure(
            job.title,
            job.description_text ?? "",
            job.department,
            { config: baselineConfig }
          );
          return {
            jobId: job.id,
            title: job.title,
            tech: result?.tech_stack ?? [],
          };
        })
      );
  const baselineLatencyMs = Date.now() - baselineStart;

  const candidateStart = Date.now();
  const candidateResults = await Promise.all(
    sampleJobs.map(async (job) => {
      const result = await extractJobStructure(
        job.title,
        job.description_text ?? "",
        job.department,
        { config: options.candidateConfig }
      );
      return {
        jobId: job.id,
        title: job.title,
        tech: result?.tech_stack ?? [],
      };
    })
  );
  const candidateLatencyMs = Date.now() - candidateStart;

  const baselineBattle = getSpecificityMetrics(baselineResults.map((result) => result.tech));
  baselineBattle.latencyMs = baselineLatencyMs;
  const candidateBattle = getSpecificityMetrics(candidateResults.map((result) => result.tech));
  candidateBattle.latencyMs = candidateLatencyMs;
  const baselineBenchmark = await scoreJobStructureBenchmarks(baselineConfig);
  const candidateBenchmark = await scoreJobStructureBenchmarks(options.candidateConfig);
  baselineBattle.metrics.push({
    id: "benchmarkFit",
    label: "Benchmark Fit",
    value: baselineBenchmark,
    tone: toneForScore(baselineBenchmark),
    helper: "Checks extraction quality against curated expected-good benchmark cases.",
  });
  candidateBattle.metrics.push({
    id: "benchmarkFit",
    label: "Benchmark Fit",
    value: candidateBenchmark,
    tone: toneForScore(candidateBenchmark),
    helper: "Checks extraction quality against curated expected-good benchmark cases.",
  });
  baselineBattle.score = clampScore(average(baselineBattle.metrics.map((metric) => metric.value)));
  candidateBattle.score = clampScore(average(candidateBattle.metrics.map((metric) => metric.value)));

  const previewRows: JobStructurePreviewRow[] = candidateResults.map((candidate) => {
    const baseline = baselineResults.find((result) => result.jobId === candidate.jobId);
    const baselineSet = new Set((baseline?.tech ?? []).map((tech) => tech.toLowerCase()));
    const candidateSet = new Set(candidate.tech.map((tech) => tech.toLowerCase()));

    return {
      jobId: candidate.jobId,
      title: candidate.title,
      currentTech: baseline?.tech ?? [],
      candidateTech: candidate.tech,
      added: candidate.tech.filter((tech) => !baselineSet.has(tech.toLowerCase())),
      removed: (baseline?.tech ?? []).filter((tech) => !candidateSet.has(tech.toLowerCase())),
    };
  });

  return {
    stage: "job-structure" as const,
    arena: options.arena,
    companyId: options.companyId,
    companyName: options.companyName,
    baseline: baselineBattle,
    candidate: candidateBattle,
    previews: previewRows,
    jobCount: sampleJobs.length,
    candidateOutput: candidateResults,
    baselineOutput: baselineResults,
    baselineConfig,
  };
}

export async function evaluateTechStackPrompt(options: {
  companyId: string;
  companyName: string;
  arena: string;
  candidateConfig: TechStackAiConfig;
}) {
  const rawData = await aggregateTechStackFromJobs(options.companyId);
  if (rawData.technologies.length === 0) {
    throw new Error("No existing tech stack data found for this company.");
  }

  const baselineConfig = await getActiveTechStackAiConfig();
  const strategicContext = await buildTechStackStrategicContext(options.companyId);

  const baselineStart = Date.now();
  const baselineStack = configsMatch(baselineConfig, options.candidateConfig)
    ? await enrichTechStackWithAnalysis(
        options.companyName,
        rawData.technologies,
        rawData.totalJobsAnalyzed,
        rawData.periodStart,
        rawData.periodEnd,
        strategicContext.context,
        baselineConfig
      )
    : await enrichTechStackWithAnalysis(
        options.companyName,
        rawData.technologies,
        rawData.totalJobsAnalyzed,
        rawData.periodStart,
        rawData.periodEnd,
        strategicContext.context,
        baselineConfig
      );
  const baselineLatencyMs = Date.now() - baselineStart;

  const candidateStart = Date.now();
  const candidateStack = await enrichTechStackWithAnalysis(
    options.companyName,
    rawData.technologies,
    rawData.totalJobsAnalyzed,
    rawData.periodStart,
    rawData.periodEnd,
    strategicContext.context,
    options.candidateConfig
  );
  const candidateLatencyMs = Date.now() - candidateStart;

  const baselineBattle = getNarrativeMetrics(rawData.technologies.length, baselineStack);
  baselineBattle.latencyMs = baselineLatencyMs;
  const candidateBattle = getNarrativeMetrics(rawData.technologies.length, candidateStack);
  candidateBattle.latencyMs = candidateLatencyMs;
  const baselineBenchmark = await scoreTechStackBenchmarks(baselineConfig);
  const candidateBenchmark = await scoreTechStackBenchmarks(options.candidateConfig);
  baselineBattle.metrics.push({
    id: "benchmarkFit",
    label: "Benchmark Fit",
    value: baselineBenchmark,
    tone: toneForScore(baselineBenchmark),
    helper: "Scores the synthesis against curated fintech stack benchmark expectations.",
  });
  candidateBattle.metrics.push({
    id: "benchmarkFit",
    label: "Benchmark Fit",
    value: candidateBenchmark,
    tone: toneForScore(candidateBenchmark),
    helper: "Scores the synthesis against curated fintech stack benchmark expectations.",
  });
  baselineBattle.score = clampScore(average(baselineBattle.metrics.map((metric) => metric.value)));
  candidateBattle.score = clampScore(average(candidateBattle.metrics.map((metric) => metric.value)));

  const previews: TechStackCategoryPreview[] = candidateStack.categories.map((category) => ({
    category: category.category,
    label: category.label,
    technologies: category.technologies.map((technology) => technology.name),
    narrativeSummary: category.narrativeSummary,
  }));

  return {
    stage: "tech-stack" as const,
    arena: options.arena,
    companyId: options.companyId,
    companyName: options.companyName,
    baseline: baselineBattle,
    candidate: candidateBattle,
    previews,
    inputTechnologyCount: rawData.technologies.length,
    rawTechnologies: rawData.technologies,
    candidateOutput: candidateStack,
    baselineOutput: baselineStack,
    baselineConfig,
  };
}

export async function evaluateWeeklyDigestPrompt(options: {
  companyId: string;
  companyName: string;
  arena: string;
  candidateConfig: WeeklyDigestAiConfig;
}) {
  const digestInput = await buildWeeklyDigestEvaluationInput(options.companyId);
  const baselineConfig = await getActiveWeeklyDigestAiConfig();

  const baselineStart = Date.now();
  const baselineOutput = await generateWeeklyDigestCommentary(digestInput, baselineConfig);
  const baselineLatencyMs = Date.now() - baselineStart;

  const candidateStart = Date.now();
  const candidateOutput = await generateWeeklyDigestCommentary(digestInput, options.candidateConfig);
  const candidateLatencyMs = Date.now() - candidateStart;

  const baselineBattle = getWeeklyDigestMetrics(digestInput, baselineOutput);
  baselineBattle.latencyMs = baselineLatencyMs;
  const candidateBattle = getWeeklyDigestMetrics(digestInput, candidateOutput);
  candidateBattle.latencyMs = candidateLatencyMs;

  const baselineBenchmark = await scoreWeeklyDigestBenchmarks(baselineConfig);
  const candidateBenchmark = await scoreWeeklyDigestBenchmarks(options.candidateConfig);

  baselineBattle.metrics.push({
    id: "benchmarkFit",
    label: "Benchmark Fit",
    value: baselineBenchmark,
    tone: toneForScore(baselineBenchmark),
    helper: "Checks objective wording and continuity detection against curated digest fixtures.",
  });
  candidateBattle.metrics.push({
    id: "benchmarkFit",
    label: "Benchmark Fit",
    value: candidateBenchmark,
    tone: toneForScore(candidateBenchmark),
    helper: "Checks objective wording and continuity detection against curated digest fixtures.",
  });
  baselineBattle.score = clampScore(average(baselineBattle.metrics.map((metric) => metric.value)));
  candidateBattle.score = clampScore(average(candidateBattle.metrics.map((metric) => metric.value)));

  return {
    stage: "weekly-digest" as const,
    arena: options.arena,
    companyId: options.companyId,
    companyName: options.companyName,
    baseline: baselineBattle,
    candidate: candidateBattle,
    previews: [{
      headline: candidateOutput.headline,
      body: candidateOutput.body,
    }] as WeeklyDigestPreview[],
    candidateOutput,
    baselineOutput,
    baselineConfig,
  };
}

export async function savePromptForgeRun(options: {
  stage: PromptStage;
  arena: string;
  companyId: string;
  companyName: string;
  model: string;
  candidateConfig: JobStructureAiConfig | TechStackAiConfig | WeeklyDigestAiConfig;
  baselineConfig: JobStructureAiConfig | TechStackAiConfig | WeeklyDigestAiConfig;
  candidateOutput: unknown;
  baselineOutput: unknown;
  battle: PromptForgeBattleSummary;
  userId: string;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("prompt_lab_runs")
    .insert({
      stage: options.stage,
      arena: options.arena,
      company_id: options.companyId,
      company_name: options.companyName,
      model: options.model,
      candidate_config: options.candidateConfig,
      baseline_config: options.baselineConfig,
      candidate_output: options.candidateOutput,
      baseline_output: options.baselineOutput,
      metrics: options.battle.metrics,
      score: options.battle.score,
      created_by: options.userId,
    })
    .select("id, created_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function listRecentPromptForgeRuns(limit: number = 12): Promise<PromptForgeRunRecord[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("prompt_lab_runs")
    .select("id, stage, arena, company_id, company_name, model, score, metrics, created_at, saved_as_active, promotion_issue_url")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    stage: row.stage as PromptStage,
    arena: row.arena,
    companyId: row.company_id,
    companyName: row.company_name,
    model: row.model,
    score: row.score,
    metrics: Array.isArray(row.metrics) ? (row.metrics as PromptForgeMetric[]) : [],
    createdAt: row.created_at,
    savedAsActive: Boolean(row.saved_as_active),
    promotionIssueUrl: row.promotion_issue_url,
  }));
}

export async function markPromptRunSaved(runId: string) {
  const supabase = createAdminClient();
  await supabase
    .from("prompt_lab_runs")
    .update({
      saved_as_active: true,
      saved_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

export interface JobStructureReprocessOptions {
  companyId?: string;
  activeOnly?: boolean;
  limit?: number;
  triggeredBy?: string;
}

async function countReprocessJobs(options: Omit<JobStructureReprocessOptions, "triggeredBy">) {
  const supabase = createAdminClient();

  let query = supabase
    .from("job_postings")
    .select("id, company_id", { count: "exact", head: true })
    .not("description_text", "is", null)
    .neq("description_text", "");

  if (options.companyId) {
    query = query.eq("company_id", options.companyId);
  }

  if (options.activeOnly !== false) {
    query = query.eq("is_active", true);
  }

  if (options.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  const total = count ?? 0;
  if (options.limit && options.limit > 0) {
    return Math.min(total, options.limit);
  }
  return total;
}

export async function createJobStructureReprocessRun(options: JobStructureReprocessOptions) {
  const supabase = createAdminClient();
  const config = await getActiveJobStructureAiConfig();
  const totalJobs = await countReprocessJobs(options);

  const { data: jobRun, error: jobRunError } = await supabase
    .from("job_runs")
    .insert({
      job_type: "analyze",
      trigger_type: "admin",
      triggered_by: options.triggeredBy,
      scope: options.companyId ? "single" : "all",
      company_id: options.companyId ?? null,
      status: "pending",
      total_companies: options.companyId ? 1 : 0,
      details: {
        operation: "job-structure-reprocess",
        totalJobs,
        processedJobs: 0,
        failedJobs: 0,
        attemptedJobs: 0,
        reprocessedCompanyIds: [],
        activeOnly: options.activeOnly !== false,
        limit: options.limit ?? null,
        model: config.model,
        version: config.version ?? buildConfigVersion("job-structure"),
      },
    })
    .select("id")
    .single();

  if (jobRunError || !jobRun) {
    throw new Error(jobRunError?.message || "Failed to create reprocess job run.");
  }

  return {
    jobRunId: jobRun.id,
    totalJobs,
  };
}

async function refreshTechStacksForReprocessCompanies(companyIds: string[]) {
  const supabase = createAdminClient();
  const config = await getActiveTechStackAiConfig();
  const uniqueCompanyIds = [...new Set(companyIds)];

  if (uniqueCompanyIds.length === 0) {
    return { refreshed: 0, skipped: 0, failed: 0 };
  }

  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, name")
    .in("id", uniqueCompanyIds);

  if (error) {
    throw new Error(`Failed to load companies for tech stack refresh: ${error.message}`);
  }

  let refreshed = 0;
  let skipped = 0;
  let failed = 0;

  for (const company of companies ?? []) {
    try {
      const rawData = await aggregateTechStackFromJobs(company.id);
      if (rawData.technologies.length === 0) {
        skipped++;
        continue;
      }

      const strategicContext = await buildTechStackStrategicContext(company.id);
      const enrichedStack = await enrichTechStackWithAnalysis(
        company.name,
        rawData.technologies,
        rawData.totalJobsAnalyzed,
        rawData.periodStart,
        rawData.periodEnd,
        strategicContext.context,
        config
      );

      await supabase
        .from("companies")
        .update({
          tech_stack: enrichedStack,
          tech_stack_generated_at: new Date().toISOString(),
        })
        .eq("id", company.id);

      refreshed++;
    } catch (error) {
      console.error(`Prompt Forge tech stack refresh failed for ${company.name}:`, error);
      failed++;
    }
  }

  return { refreshed, skipped, failed };
}

async function loadJobStructureReprocessContext(
  jobRunId: string,
  optionsOverride?: Partial<Omit<JobStructureReprocessOptions, "triggeredBy">>
) {
  const supabase = createAdminClient();
  const { data: jobRun, error: jobRunError } = await supabase
    .from("job_runs")
    .select("status, details, company_id")
    .eq("id", jobRunId)
    .single();

  if (jobRunError || !jobRun) {
    throw new Error(jobRunError?.message || "Reprocess job run not found.");
  }

  const details = (jobRun.details as Record<string, unknown>) ?? {};
  const options = {
    companyId: (optionsOverride?.companyId ?? jobRun.company_id ?? details.companyId) as string | undefined,
    activeOnly: (optionsOverride?.activeOnly ?? details.activeOnly ?? true) as boolean,
    limit: (optionsOverride?.limit ?? details.limit ?? undefined) as number | undefined,
  };

  return {
    supabase,
    jobRun,
    details,
    options,
    config: await getActiveJobStructureAiConfig(),
  };
}

export async function processJobStructureReprocessBatch(
  jobRunId: string,
  optionsOverride?: Partial<Omit<JobStructureReprocessOptions, "triggeredBy">>
) {
  const {
    supabase,
    jobRun,
    details,
    options,
    config,
  } = await loadJobStructureReprocessContext(jobRunId, optionsOverride);

  const attemptedJobs = Number(details.attemptedJobs ?? 0);
  const processedJobs = Number(details.processedJobs ?? 0);
  const failedJobs = Number(details.failedJobs ?? 0);
  const totalJobs = Number(details.totalJobs ?? 0);
  const reprocessedCompanyIds = Array.isArray(details.reprocessedCompanyIds)
    ? details.reprocessedCompanyIds.filter((item): item is string => typeof item === "string")
    : [];

  if (jobRun.status === "pending") {
    await supabase
      .from("job_runs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        completed_at: null,
        details: {
          ...details,
          operation: "job-structure-reprocess",
          status: "running",
          processedJobs,
          failedJobs,
          attemptedJobs,
          totalJobs,
          reprocessedCompanyIds,
          activeOnly: options.activeOnly !== false,
          limit: options.limit ?? null,
          model: config.model,
          version: config.version ?? buildConfigVersion("job-structure"),
        },
      })
      .eq("id", jobRunId);
  }

  const BATCH_SIZE = 5;
  const maxIndex = totalJobs > 0 ? totalJobs - 1 : attemptedJobs + BATCH_SIZE - 1;
  const rangeEnd = Math.min(attemptedJobs + BATCH_SIZE - 1, maxIndex);

  let query = supabase
    .from("job_postings")
    .select("id, company_id, title, description_text, department, location, is_active")
    .not("description_text", "is", null)
    .neq("description_text", "")
    .order("first_seen_date", { ascending: false })
    .range(attemptedJobs, rangeEnd);

  if (options.companyId) {
    query = query.eq("company_id", options.companyId);
  }

  if (options.activeOnly !== false) {
    query = query.eq("is_active", true);
  }

  const { data: jobs, error } = await query;
  if (error) {
    await supabase
      .from("job_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: error.message,
      })
      .eq("id", jobRunId);
    throw new Error(error.message);
  }

  const batch = jobs ?? [];
  if (batch.length === 0) {
    const techStackRefresh = await refreshTechStacksForReprocessCompanies(reprocessedCompanyIds);
    const companyCount = new Set(reprocessedCompanyIds).size;
    const finalStatus = failedJobs > 0 && processedJobs === 0 ? "failed" : "completed";

    await supabase
      .from("job_runs")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        total_companies: companyCount,
        completed_companies: finalStatus === "completed" ? companyCount : 0,
        failed_companies: failedJobs > 0 ? companyCount : 0,
        details: {
          ...details,
          operation: "job-structure-reprocess",
          totalJobs,
          processedJobs,
          failedJobs,
          attemptedJobs,
          reprocessedCompanyIds,
          techStacks: techStackRefresh,
          activeOnly: options.activeOnly !== false,
          limit: options.limit ?? null,
          model: config.model,
          version: config.version ?? buildConfigVersion("job-structure"),
        },
      })
      .eq("id", jobRunId);

    return {
      jobRunId,
      completed: true,
      totalJobs,
      processedJobs,
      failedJobs,
      techStackRefresh,
    };
  }

  let processed = processedJobs;
  let failed = failedJobs;
  const companyIds = new Set(reprocessedCompanyIds);

  const results = await Promise.allSettled(
    batch.map(async (row) => {
      companyIds.add(row.company_id);
      await extractAndUpdateStructure(
        row.id,
        row.title,
        row.description_text ?? "",
        row.department,
        row.location,
        config
      );
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      processed++;
    } else {
      failed++;
    }
  }

  const attempted = attemptedJobs + batch.length;

  await supabase
    .from("job_runs")
    .update({
      status: "running",
      details: {
        ...details,
        operation: "job-structure-reprocess",
        totalJobs,
        processedJobs: processed,
        failedJobs: failed,
        attemptedJobs: attempted,
        reprocessedCompanyIds: [...companyIds],
        activeOnly: options.activeOnly !== false,
        limit: options.limit ?? null,
        model: config.model,
        version: config.version ?? buildConfigVersion("job-structure"),
      },
    })
    .eq("id", jobRunId);

  return {
    jobRunId,
    completed: false,
    totalJobs,
    processedJobs: processed,
    failedJobs: failed,
    attemptedJobs: attempted,
    remainingJobs: Math.max(totalJobs - attempted, 0),
  };
}

export async function executeJobStructureReprocessRun(
  jobRunId: string,
  optionsOverride?: Partial<Omit<JobStructureReprocessOptions, "triggeredBy">>
) {
  while (true) {
    const result = await processJobStructureReprocessBatch(jobRunId, optionsOverride);
    if (result.completed) {
      return result;
    }
  }
}

export async function reprocessJobStructures(options: JobStructureReprocessOptions) {
  const job = await createJobStructureReprocessRun(options);
  const result = await executeJobStructureReprocessRun(job.jobRunId, options);
  return result;
}

export function buildPromptPromotionIssue(options: {
  stage: PromptStage;
  runId: string;
  model: string;
  promptTemplate: string;
  score: number;
  metrics: PromptForgeMetric[];
}) {
  const targetFile =
    options.stage === "job-structure"
      ? "web/lib/analysis/structure.ts"
      : options.stage === "tech-stack"
        ? "web/lib/ai/tech-stack-extraction.ts"
        : "web/lib/analysis/digest.ts";

  const settingsFile = "web/lib/ai/prompt-config.ts";
  const stageLabel =
    options.stage === "job-structure"
      ? "Stage 1 job structure extraction"
      : options.stage === "tech-stack"
        ? "Stage 2 company tech stack synthesis"
        : "Weekly digest company summary generation";

  return `## Summary
- Promote the approved Prompt Forge configuration for ${stageLabel} into source-controlled defaults.
- Align the code default prompt/model with the admin-approved runtime configuration from run \`${options.runId}\`.
- Preserve the existing runtime-settings system; this PR should sync defaults, not replace DB-backed configuration.

## Approved configuration
- Stage: \`${options.stage}\`
- Model: \`${options.model}\`
- Prompt Forge score: \`${options.score}\`
- Metrics: ${options.metrics.map((metric) => `${metric.label} ${metric.value}`).join(", ")}

## Required changes
1. Update \`${settingsFile}\` so the default config for \`${options.stage}\` matches the approved model and prompt below.
2. Ensure the stage implementation in \`${targetFile}\` still consumes the default config correctly.
3. Do not remove runtime loading from \`system_settings\`; the app must continue honoring saved admin settings.
4. Keep all model options restricted to approved Gemini 3 models only.
5. Do not change unrelated UI or business logic.

## Approved prompt text
\`\`\`text
${options.promptTemplate}
\`\`\`

## Acceptance criteria
- The default config in code matches the approved Prompt Forge configuration exactly.
- Existing runtime-save behavior still works with DB-backed prompt/model settings.
- \`cd web && npm run build\` passes.

## Out of scope
- New schema migrations
- Reworking Prompt Forge UX
- Changing the GitHub Actions workflow itself`;
}

export async function promotePromptConfig(options: {
  runId: string;
  stage: PromptStage;
  model: string;
  promptTemplate: string;
  score: number;
  metrics: PromptForgeMetric[];
  triggerCodegen?: boolean;
}) {
  const issue = await createGitHubIssue({
    title:
      options.stage === "job-structure"
        ? "Sync approved Prompt Forge job extraction config"
        : options.stage === "tech-stack"
          ? "Sync approved Prompt Forge tech stack synthesis config"
          : "Sync approved Prompt Forge weekly digest config",
    body: buildPromptPromotionIssue(options),
    labels: ["feedback", "improvement"],
  });

  if (options.triggerCodegen) {
    await triggerCodeGenWorkflow(issue.number);
  }

  const supabase = createAdminClient();
  await supabase
    .from("prompt_lab_runs")
    .update({
      promotion_issue_number: issue.number,
      promotion_issue_url: issue.html_url,
    })
    .eq("id", options.runId);

  return issue;
}

export async function getPromptForgeInitialData() {
  const supabase = createAdminClient();
  const [configs, runsResult, companiesResult] = await Promise.all([
    getActivePromptConfigs(),
    listRecentPromptForgeRuns(12),
    supabase
      .from("companies")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("name"),
  ]);

  if (companiesResult.error) {
    throw new Error(companiesResult.error.message);
  }

  return {
    companies: (companiesResult.data ?? []) as PromptForgeCompanyOption[],
    activeConfigs: configs,
    runs: runsResult,
    modelOptions: AI_MODEL_OPTIONS,
  };
}
