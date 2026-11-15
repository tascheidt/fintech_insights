/**
 * The model eval suite's surface registry: one entry per AI output the
 * product produces (see MODEL_SURFACES in lib/ai/prompt-config.ts).
 *
 * Each entry drives the REAL production function (same prompt, same parsing,
 * same retries) with fixture inputs, and declares how to score the result:
 *
 * - `score`      deterministic metrics in [0,1] (golden labels, curated
 *                benchmark expectations, schema completeness, accuracy).
 * - `agreement`  similarity to the baseline model's output for the same case
 *                (decision stability — useful, but NOT correctness).
 * - `voice`      heuristic voice-rule warnings (user-facing surfaces only).
 * - `rubric`     present ⇒ the pairwise judge compares candidate vs baseline.
 *
 * Adding a surface: add it to MODEL_SURFACES, give the call site
 * `modelFor(<surface>)`, add fixtures in fixtures.ts, then an entry here.
 */

import type { ModelSurface } from "@/lib/ai/prompt-config";
import {
  DEFAULT_JOB_STRUCTURE_AI_CONFIG,
  DEFAULT_TECH_STACK_AI_CONFIG,
  DEFAULT_WEEKLY_DIGEST_AI_CONFIG,
  type AllowedAiModel,
} from "@/lib/ai/prompt-config";
import { checkVoice } from "@/lib/ai/voice-validator";
import { scoreAgainstGolden, scoreExtraction } from "@/lib/ai/eval/agreement";
import { extractJobStructure, type JobStructureForDB } from "@/lib/analysis/structure";
import { analyzeJobAdvanced, type AdvancedAnalyzeResult } from "@/lib/analysis/advanced-strategic";
import { generateWeeklyDigestCommentary, type DigestCommentary } from "@/lib/analysis/digest";
import { enrichTechStackWithAnalysis, type CompanyTechStack } from "@/lib/ai/tech-stack-extraction";
import { generateInsightWithLLM } from "@/lib/analysis/company-insights";
import { generateEditorialFromContext, type EditorialOutput } from "@/lib/analysis/company-editorial";
import { generateThemeLabels, type ThemeLabelOutput } from "@/lib/analysis/cross-company-themes";
import { generateSearchReportSynthesis } from "@/lib/analysis/search-report";
import { triageFeedback, type TriageResult } from "@/lib/analysis/feedback-triage";
import { buildCompanyInsightChatPrompt, generateCompanyInsightChatReply } from "@/lib/analysis/insight-chat";
import { generatePosting } from "@/lib/analysis/posting-generator";
import { analyzeCompanyStrategy, type StrategyAnalysisResult } from "@/lib/ai/strategy-analysis";
import { detectCompanyType, formatResearchForPrompt, performDeepResearch, type CompanyType, type ResearchResult } from "@/lib/analysis/company-research";
import { formatExtendedContextForPrompt } from "@/lib/analysis/context-builder";
import { fetchCompanyNewsContext, type CompanyNewsContext } from "@/lib/analysis/company-news";
import { categorizePosting, type JobCategoryResult } from "@/lib/analysis/categorizer";
import type { ReportSynthesis } from "@/lib/reports/types";
import {
  WEEKLY_DIGEST_BENCHMARKS,
  TECH_STACK_BENCHMARKS,
  scoreWeeklyDigestBenchmark,
  scoreTechStackBenchmark,
} from "@/lib/labs/prompt-forge-benchmarks";
import * as fx from "./fixtures";

export interface EvalCase {
  id: string;
  input: unknown;
  /** What the judge sees as the source of truth for this case. */
  source: string;
}

/** Outputs produced earlier in the same run, for surfaces that chain. */
export interface RunContext {
  baselineOutput(surface: ModelSurface, caseId: string): unknown;
}

/** Metric name → value in [0,1]. Missing keys mean "not applicable". */
export type Metrics = Partial<Record<string, number>>;

export interface SurfaceSpec {
  surface: ModelSurface;
  label: string;
  /** Rough share of production AI spend/volume — orders the report. */
  traffic: "per-job hot path" | "per-company weekly" | "weekly" | "user-triggered" | "event-driven" | "backfill";
  userFacing: boolean;
  grounded: boolean;
  /** Surfaces this one needs results from (run first). */
  dependsOn?: ModelSurface[];
  cases(ctx: RunContext): EvalCase[];
  run(c: EvalCase, model: string): Promise<unknown>;
  render(output: unknown): string;
  score?(c: EvalCase, output: unknown): Metrics;
  agreement?(c: EvalCase, output: unknown, baseline: unknown): Metrics;
  voice?(output: unknown): string[];
  rubric?: string;
}

const json = (o: unknown) => JSON.stringify(o, null, 2);
const nonEmpty = (s: unknown) => (typeof s === "string" && s.trim().length > 0 ? 1 : 0);
const frac = (parts: number[]) => (parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0);

function voiceOf(fields: Parameters<typeof checkVoice>[0]): string[] {
  return checkVoice(fields).warnings;
}

function voiceTexts(texts: Array<string | null | undefined>): string[] {
  return texts.flatMap((t) => (t ? checkVoice({ body: t }).warnings : []));
}

function jobSource(j: fx.FixtureJob): string {
  return `Company: ${j.company_name}\nTitle: ${j.title}\nDepartment (ATS): ${j.department}\nLocation (ATS): ${j.location}\n\n${j.description_text.slice(0, 6000)}`;
}

function contextSource(slug: string): string {
  const jobs = fx.companyJobs(slug);
  return [
    `Company: ${jobs[0]?.company_name}. Evidence available to the model: ${jobs.length} postings (thin sample) and no external research.`,
    ...jobs.map((j) => `- ${j.title} (${fx.enriched(j).function_category}; tech: ${fx.enriched(j).tech_stack.join(", ") || "none named"})\n  ${j.description_text.slice(0, 700)}`),
  ].join("\n");
}

const asConfig = <T extends { model: AllowedAiModel }>(base: T, model: string): T => ({ ...base, model: model as AllowedAiModel });

export const SURFACES: SurfaceSpec[] = [
  // ------------------------------------------------------------------ hot path
  {
    surface: "job-structure",
    label: "Job structure extraction",
    traffic: "per-job hot path",
    userFacing: false,
    grounded: false,
    cases: () =>
      fx.sampleJobs().map((j) => ({ id: j.id.slice(0, 8), input: j, source: jobSource(j) })),
    run: (c, model) => {
      const j = c.input as fx.FixtureJob;
      return extractJobStructure(j.title, j.description_text, j.department, {
        config: asConfig(DEFAULT_JOB_STRUCTURE_AI_CONFIG, model),
      });
    },
    render: json,
    score: (c, out) => {
      const g = fx.goldenFor((c.input as fx.FixtureJob).id);
      if (!g || !out) return {};
      const s = scoreAgainstGolden(out as JobStructureForDB, g);
      return {
        golden_l1: s.l1Correctness,
        ...Object.fromEntries(s.fields.map((f) => [`golden_${f.field}`, f.score])),
        tech_recall: s.techRecall,
        tech_precision: s.techPrecision,
      };
    },
    agreement: (_c, out, base) =>
      out && base ? { l1_vs_baseline: scoreExtraction(out as JobStructureForDB, base as JobStructureForDB).l1Agreement } : {},
  },
  {
    surface: "job-analysis",
    label: "Per-job strategic analysis (grounded)",
    traffic: "per-job hot path",
    userFacing: true,
    grounded: true,
    cases: () =>
      fx.JOB_ANALYSIS_INDEXES.map((i) => fx.sampleJobs()[i]).map((j) => ({
        id: j.id.slice(0, 8),
        input: j,
        source: `${jobSource(j)}\n\nCompany hiring context: ${fx.historicalContext(j.company_slug).summary}`,
      })),
    run: (c, model) => {
      const j = c.input as fx.FixtureJob;
      return analyzeJobAdvanced({
        companyId: j.company_id,
        companyName: j.company_name,
        job: {
          title: j.title,
          standardized_department: fx.enriched(j).standardized_department,
          location: j.location,
          description_text: j.description_text,
        },
        historicalContext: fx.historicalContext(j.company_slug),
        analysisModel: model,
        analysisQuotaFallback: false,
      });
    },
    render: json,
    score: (_c, out) => {
      const o = out as AdvancedAnalyzeResult | null;
      if (!o) return {};
      return {
        completeness: frac([
          nonEmpty(o.headline),
          nonEmpty(o.insight_summary),
          nonEmpty(o.what_it_means),
          nonEmpty(o.strategic_hypothesis),
          o.strategic_signals?.length ? 1 : 0,
        ]),
        web_corroborated: nonEmpty(o.web_corroboration),
      };
    },
    agreement: (_c, out, base) => {
      const o = out as AdvancedAnalyzeResult | null;
      const b = base as AdvancedAnalyzeResult | null;
      if (!o || !b) return {};
      return {
        same_category: o.category === b.category ? 1 : 0,
        same_new_direction: o.is_new_direction === b.is_new_direction ? 1 : 0,
        same_confidence: o.confidence === b.confidence ? 1 : 0,
      };
    },
    voice: (out) => {
      const o = out as AdvancedAnalyzeResult | null;
      return o ? voiceOf({ headline: o.headline, insight_summary: o.insight_summary, what_it_means: o.what_it_means }) : [];
    },
    rubric:
      "A sharp, evidence-backed read on what this single posting signals about the company's strategy. Headline is plain and specific; the summary separates what the posting says from what is inferred; confidence and novelty are calibrated to thin evidence; any web corroboration is relevant rather than padding.",
  },
  // --------------------------------------------------------- weekly / company
  {
    surface: "weekly-digest",
    label: "Weekly digest company entries",
    traffic: "weekly",
    userFacing: true,
    grounded: false,
    cases: () =>
      WEEKLY_DIGEST_BENCHMARKS.map((b) => ({
        id: b.id,
        input: b,
        source: json({ ...b.input, company_name: `Benchmark ${b.id}` }),
      })),
    run: (c, model) => {
      const b = c.input as (typeof WEEKLY_DIGEST_BENCHMARKS)[number];
      // Neutral names only — never production digests (same rule as gemini-compare).
      return generateWeeklyDigestCommentary(
        { ...b.input, company_name: `Benchmark ${b.id}` },
        asConfig(DEFAULT_WEEKLY_DIGEST_AI_CONFIG, model)
      );
    },
    render: json,
    score: (c, out) =>
      out ? { benchmark_fit: scoreWeeklyDigestBenchmark(out as DigestCommentary, c.input as (typeof WEEKLY_DIGEST_BENCHMARKS)[number]) / 100 } : {},
    voice: (out) => {
      const o = out as DigestCommentary | null;
      return o ? voiceOf({ headline: o.headline, body: o.body }) : [];
    },
    rubric:
      "A short, factual weekly hiring brief for one company: a plain headline and a body that uses the supplied counts and role themes correctly, distinguishes continuing themes from genuinely new ones, and never overclaims a strategic shift the postings do not support.",
  },
  {
    surface: "tech-stack",
    label: "Tech-stack enrichment",
    traffic: "per-company weekly",
    userFacing: true,
    grounded: false,
    cases: () => TECH_STACK_BENCHMARKS.map((b) => ({ id: b.id, input: b, source: json(b) })),
    run: (c, model) => {
      const b = c.input as (typeof TECH_STACK_BENCHMARKS)[number];
      return enrichTechStackWithAnalysis(
        b.companyName,
        b.technologies,
        b.totalJobsAnalyzed,
        b.periodStart,
        b.periodEnd,
        b.strategicContext ?? "No company strategic context is available.",
        asConfig(DEFAULT_TECH_STACK_AI_CONFIG, model)
      );
    },
    render: json,
    score: (c, out) => {
      const o = out as CompanyTechStack | null;
      if (!o) return {};
      return {
        benchmark_fit: scoreTechStackBenchmark(o, c.input as (typeof TECH_STACK_BENCHMARKS)[number]) / 100,
        llm_enriched: o.architectSummary ? 1 : 0,
      };
    },
    rubric:
      "Technologies grouped into sensible categories using only the supplied mentions, plus an architect-level summary that interprets the stack without inventing systems, and marks inference as inference.",
  },
  {
    surface: "company-insight",
    label: "Company insight narrative",
    traffic: "per-company weekly",
    userFacing: true,
    grounded: false,
    cases: () =>
      // The judge sees the SAME context blocks the prompt is built from. A
      // slimmer summary made the judges flag the real 90-day window and
      // function-group names as fabrications (Nov 2026 run).
      fx.NARRATIVE_COMPANIES.map((slug) => ({
        id: slug,
        input: slug,
        source: `${formatExtendedContextForPrompt(fx.extendedContext(slug))}\n\n${formatResearchForPrompt(fx.NO_RESEARCH)}`,
      })),
    run: (c, model) => {
      void model;
      const slug = c.input as string;
      const truth = fx.COMPANY_TRUTH[slug];
      const ct: CompanyType = { isPublic: truth?.isPublic ?? false, confidence: "high" };
      return generateInsightWithLLM(fx.companyJobs(slug)[0].company_name, fx.extendedContext(slug), fx.NO_RESEARCH, ct, null);
    },
    render: json,
    score: (_c, out) => {
      const o = out as Record<string, unknown> | null;
      if (!o) return {};
      return {
        completeness: frac(["headline", "executiveSummary", "strategicHypothesis", "alignmentAnalysis", "strategicImplications", "keySignal"].map((k) => nonEmpty(o[k]))),
      };
    },
    voice: (out) => {
      const o = out as { headline?: string; executiveSummary?: string; keySignal?: string } | null;
      return o ? voiceOf({ headline: o.headline, executive_summary: o.executiveSummary, key_signal: o.keySignal }) : [];
    },
    rubric:
      "An evidence-backed company insight from a THIN sample (3 postings, no external research). The best output is honest about how little the evidence supports, still extracts the real signal from the postings, keeps named systems exact, and does not fabricate strategy, funding, or market claims.",
  },
  {
    surface: "company-editorial",
    label: "Company editorial (thesis / bets)",
    traffic: "per-company weekly",
    userFacing: true,
    grounded: false,
    cases: () =>
      fx.NARRATIVE_COMPANIES.map((slug) => ({ id: slug, input: slug, source: json(fx.editorialContext(slug)) })),
    run: (c) => generateEditorialFromContext(fx.editorialContext(c.input as string)),
    render: json,
    score: (_c, out) => {
      const o = out as EditorialOutput | null;
      if (!o) return {};
      return {
        bets_with_evidence: o.bets.length ? o.bets.filter((b) => b.evidence.length > 0).length / o.bets.length : 0,
      };
    },
    voice: (out) => {
      const o = out as EditorialOutput | null;
      return o ? voiceOf({ body: o.thesis, insight_summary: o.last_change, executive_summary: o.interpretation }) : [];
    },
    rubric:
      "A working thesis, interpretation and 1-6 strategic bets for the company, each bet tied to evidence in the supplied context. Calibrated confidence on thin evidence; no invented initiatives; plain editorial voice.",
  },
  {
    surface: "theme-labels",
    label: "Cross-company theme labels",
    traffic: "weekly",
    userFacing: true,
    grounded: false,
    cases: () => [
      { id: "all-companies", input: fx.themeBundles(), source: json(fx.themeBundles()) },
      {
        id: "fintechs-only",
        input: fx.themeBundles((j) => ["koho", "neo-financial", "wealthsimple", "questrade", "eq-bank"].includes(j.company_slug)),
        source: json(fx.themeBundles((j) => ["koho", "neo-financial", "wealthsimple", "questrade", "eq-bank"].includes(j.company_slug))),
      },
    ],
    run: (c) => generateThemeLabels(c.input as Parameters<typeof generateThemeLabels>[0]),
    render: json,
    score: (c, out) => {
      const o = (out ?? []) as ThemeLabelOutput[];
      const groups = (c.input as Array<{ group: string }>).map((b) => b.group.toLowerCase());
      const covered = groups.filter((g) => o.some((t) => t.group.toLowerCase() === g)).length;
      return { group_coverage: groups.length ? covered / groups.length : 0 };
    },
    voice: (out) => voiceTexts(((out ?? []) as ThemeLabelOutput[]).flatMap((t) => [t.label, t.description])),
    rubric:
      "One short, author-quality label and one-sentence description per function group, specific to the supplied keywords and titles (not generic department names), with no hype.",
  },
  // ------------------------------------------------------------ user-triggered
  {
    surface: "search-report",
    label: "Shared search report synthesis",
    traffic: "user-triggered",
    userFacing: true,
    grounded: false,
    cases: () => {
      const mk = (id: string, f: (j: fx.FixtureJob) => boolean, q: string | null, g: string | null) => {
        const req = fx.searchReportRequest(id, f, q, g);
        return { id, input: req, source: json(req) };
      };
      return [
        mk("all-results", () => true, null, null),
        mk("engineering", (j) => fx.enriched(j).function_category.startsWith("engineering"), "engineer", "Engineering"),
        mk("risk", (j) => /risk/i.test(j.title), "risk", null),
      ];
    },
    run: async (c) => {
      const out = await generateSearchReportSynthesis(c.input as Parameters<typeof generateSearchReportSynthesis>[0]);
      if (!out) throw new Error("synthesis returned null (all attempts failed)");
      return out;
    },
    render: json,
    score: (_c, out) => {
      const o = out as ReportSynthesis | null;
      if (!o) return {};
      return { has_groups: o.roleGroups.length > 0 ? 1 : 0, has_requirements: o.commonRequirements.length > 0 ? 1 : 0 };
    },
    voice: (out) => {
      const o = out as ReportSynthesis | null;
      return o ? voiceOf({ headline: o.headline, body: o.summary }) : [];
    },
    rubric:
      "The block at the top of a shared report: what kinds of roles the search returned, how they cluster (with plausible counts), and requirements that genuinely recur. Read by outsiders, so it must be accurate to the postings and free of jargon and hype.",
  },
  {
    surface: "insight-chat",
    label: "Company insight chat",
    traffic: "user-triggered",
    userFacing: true,
    grounded: false,
    dependsOn: ["company-insight"],
    cases: (ctx) =>
      fx.NARRATIVE_COMPANIES.slice(0, 2).flatMap((slug) => {
        const insight = ctx.baselineOutput("company-insight", slug) as Record<string, unknown> | undefined;
        if (!insight) return [];
        const chatInsight = {
          analysis_period_start: new Date(Date.now() - 90 * 86400_000).toISOString(),
          analysis_period_end: new Date().toISOString(),
          executive_summary: (insight.executiveSummary as string) ?? null,
          strategic_hypothesis: (insight.strategicHypothesis as string) ?? null,
          core_functions: fx.extendedContext(slug).functionBreakdown,
          stated_strategy: null,
          alignment_analysis: (insight.alignmentAnalysis as string) ?? null,
          discrepancies: insight.discrepancies ?? [],
          strategic_implications: (insight.strategicImplications as string) ?? null,
        };
        return fx.CHAT_QUESTIONS.map((q, i) => {
          const prompt = buildCompanyInsightChatPrompt({
            companyName: fx.companyJobs(slug)[0].company_name,
            insight: chatInsight,
            history: [],
            message: q,
          });
          return { id: `${slug}-q${i + 1}`, input: prompt, source: prompt };
        });
      }),
    run: (c) => generateCompanyInsightChatReply(c.input as string, { eval: true }),
    render: (o) => String(o ?? ""),
    voice: (out) => voiceTexts([String(out ?? "")]),
    rubric:
      "A direct answer to the user's question grounded in the insight context, citing the specific data it relies on, and saying plainly when the context does not support an answer.",
  },
  {
    surface: "posting-generator",
    label: "Job posting generator",
    traffic: "user-triggered",
    userFacing: true,
    grounded: false,
    cases: () => fx.postingCases().map((p) => ({ id: p.id, input: p, source: json(p) })),
    run: (c) => {
      const p = c.input as ReturnType<typeof fx.postingCases>[number];
      return generatePosting(p.jobs, p.params);
    },
    render: (o) => String(o ?? ""),
    score: (_c, out) => {
      const t = String(out ?? "");
      const sections = ["responsibilit", "requirement", "nice to have"].filter((s) => t.toLowerCase().includes(s)).length;
      return { has_sections: sections / 3 };
    },
    voice: (out) => voiceTexts([String(out ?? "")]),
    rubric:
      "An original job posting synthesized from the sources at the requested seniority and tone, with the required sections, no verbatim copying, and no invented perks, salary, or policies.",
  },
  {
    surface: "strategy-lab",
    label: "Strategy lab analysis",
    traffic: "user-triggered",
    userFacing: true,
    grounded: false,
    cases: () => ["wealthsimple", "koho"].map((slug) => ({ id: slug, input: slug, source: contextSource(slug) })),
    run: async (c) => {
      const slug = c.input as string;
      const out = await analyzeCompanyStrategy(fx.companyJobs(slug)[0].company_name, fx.strategyLabJobs(slug));
      if (!out) throw new Error("analyzeCompanyStrategy returned null");
      return out;
    },
    render: json,
    score: (_c, out) => {
      const o = out as StrategyAnalysisResult | null;
      return o ? { has_initiatives: o.initiatives.length > 0 ? 1 : 0 } : {};
    },
    rubric:
      "A small set of strategic initiatives inferred from the supplied postings, each supported by the roles assigned to it, with confidence calibrated to how many roles support it.",
  },
  // ------------------------------------------------------------- research
  {
    surface: "company-research",
    label: "Company research (type detection + grounded deep research)",
    traffic: "per-company weekly",
    userFacing: false,
    grounded: true,
    cases: () => [
      ...Object.keys(fx.COMPANY_TRUTH).map((slug) => ({
        id: `type-${slug}`,
        input: { kind: "type", name: fx.companyJobs(slug)[0]?.company_name ?? slug, slug },
        source: fx.COMPANY_TRUTH[slug].note,
      })),
      ...["wealthsimple", "rbc"].map((slug) => ({
        id: `deep-${slug}`,
        input: { kind: "deep", name: fx.companyJobs(slug)[0]?.company_name ?? slug, slug },
        source: `Grounded web research on ${slug}.`,
      })),
    ],
    run: (c) => {
      const i = c.input as { kind: "type" | "deep"; name: string; slug: string };
      if (i.kind === "type") return detectCompanyType(i.name);
      return performDeepResearch(i.name, {
        isPublic: fx.COMPANY_TRUTH[i.slug]?.isPublic ?? false,
        depth: "basic",
        maxSearches: 3,
      });
    },
    render: json,
    score: (c, out) => {
      const i = c.input as { kind: "type" | "deep"; slug: string };
      if (!out) return {};
      if (i.kind === "type") {
        const truth = fx.COMPANY_TRUTH[i.slug]?.isPublic;
        return truth === null || truth === undefined ? {} : { type_accuracy: (out as CompanyType).isPublic === truth ? 1 : 0 };
      }
      const r = out as ResearchResult;
      return {
        sources_found: Math.min(1, r.sources.length / 5),
        verified_share: r.sources.length ? r.sources.filter((s) => s.verificationStatus === "verified").length / r.sources.length : 0,
        stated_strategy_found: nonEmpty(r.statedStrategy),
      };
    },
  },
  {
    surface: "company-news",
    label: "Company news context (grounded)",
    traffic: "per-company weekly",
    userFacing: true,
    grounded: true,
    cases: () => ["wealthsimple", "koho", "neo-financial"].map((slug) => ({ id: slug, input: fx.companyJobs(slug)[0].company_name, source: `Grounded news search for ${slug}.` })),
    run: (c) => fetchCompanyNewsContext(c.input as string),
    render: json,
    score: (_c, out) => {
      const o = out as CompanyNewsContext | null;
      if (!o) return {};
      const items = [...o.recentNews, ...o.leadershipChanges];
      return {
        news_items: Math.min(1, o.recentNews.length / 5),
        items_with_source: items.length ? items.filter((n) => Boolean((n as { url?: string; source?: string }).url ?? (n as { source?: string }).source)).length / items.length : 0,
      };
    },
  },
  // --------------------------------------------------------------- internal
  {
    surface: "feedback-triage",
    label: "Feedback triage",
    traffic: "event-driven",
    userFacing: false,
    grounded: false,
    cases: () => fx.triageCases().map((t) => ({ id: t.submission.id.slice(0, 8), input: t, source: json(t) })),
    run: (c) => {
      const t = c.input as ReturnType<typeof fx.triageCases>[number];
      return triageFeedback(t.submission, t.candidates);
    },
    render: json,
    score: (_c, out) => {
      const o = out as TriageResult | null;
      return o ? { drafted_issue: o.decision === "no" ? 1 : nonEmpty(o.issue_markdown) } : {};
    },
    agreement: (_c, out, base) => {
      const o = out as TriageResult | null;
      const b = base as TriageResult | null;
      return o && b ? { same_decision: o.decision === b.decision ? 1 : 0 } : {};
    },
    rubric:
      "A correct triage decision for the submission (bugs judged on specificity and blast radius, never declined on roadmap grounds), honest confidence, and — when accepted — a GitHub issue draft an engineer could act on without re-reading the submission.",
  },
  {
    surface: "categorize",
    label: "Role categorization (backfill only)",
    traffic: "backfill",
    userFacing: false,
    grounded: false,
    cases: () => fx.sampleJobs().slice(0, 12).map((j) => ({ id: j.id.slice(0, 8), input: j, source: jobSource(j) })),
    run: (c, model) => {
      const j = c.input as fx.FixtureJob;
      return categorizePosting(j.title, j.company_name, j.description_text, { model });
    },
    render: json,
    score: (c, out) => {
      const o = out as JobCategoryResult | null;
      const g = fx.goldenFor((c.input as fx.FixtureJob).id);
      if (!o || !g) return {};
      const ok = [g.expected.function_category, ...(g.acceptable?.function_category ?? [])].includes(o.role_category);
      return { golden_category: ok ? 1 : 0 };
    },
  },
];

export function surfaceSpec(id: ModelSurface): SurfaceSpec | undefined {
  return SURFACES.find((s) => s.surface === id);
}
