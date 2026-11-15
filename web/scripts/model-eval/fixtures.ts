/**
 * Fixture inputs for every surface in the model eval suite.
 *
 * Everything here is DERIVED, deterministically, from data already committed
 * to the repo — no database reads, no production records, nothing invented:
 *
 *   scripts/fixtures/gemini-sample-jobs.json   24 real postings, 8 companies
 *   scripts/fixtures/golden-extraction.json    hand-labeled fields for those 24
 *   scripts/artifacts/baseline-extract-structure-cd6c3fc.json
 *                                              May 2026 Flash keywords for them
 *   scripts/fixtures/feedback-history.json     22 feedback submissions (no PII)
 *   lib/labs/prompt-forge-benchmarks.ts        curated digest / tech-stack cases
 *
 * Because inputs are identical for every model in a run, any difference in
 * output is the model's. Thin context (3 postings per company) is deliberate:
 * it rewards models that say "limited evidence" instead of inventing a story.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import type { GoldenExtractionRecord } from "@/lib/ai/eval/agreement";
import type { ExtendedHistoricalContext, HistoricalContext } from "@/lib/analysis/context-builder";
import type { ResearchResult } from "@/lib/analysis/company-research";
import type { EditorialContext } from "@/lib/analysis/company-editorial";
import type { ThemeInputBundle } from "@/lib/analysis/cross-company-themes";
import type { SynthesisRequest } from "@/lib/analysis/search-report";
import type { TriageSubmission, DuplicateCandidate } from "@/lib/analysis/feedback-triage";
import type { PostingSourceJob, PostingParams } from "@/lib/analysis/posting-generator";
import type { JobPosting } from "@/lib/ai/strategy-analysis";
import {
  getCategoryGroup,
  getCategoryLabel,
  getGroupStats,
  type FunctionStats,
  type RoleCategory,
} from "@/lib/analysis/function-categories";

const ROOT = process.cwd();
const read = <T>(rel: string): T => JSON.parse(readFileSync(resolve(ROOT, rel), "utf8")) as T;

export interface FixtureJob {
  id: string;
  title: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  department: string | null;
  location: string | null;
  description_text: string;
}

export const FIXTURE_FILES = {
  jobs: "scripts/fixtures/gemini-sample-jobs.json",
  golden: "scripts/fixtures/golden-extraction.json",
  keywords: "scripts/artifacts/baseline-extract-structure-cd6c3fc.json",
  feedback: "scripts/fixtures/feedback-history.json",
} as const;

let cache: {
  jobs: FixtureJob[];
  golden: Map<string, GoldenExtractionRecord>;
  keywords: Map<string, string[]>;
} | null = null;

function load() {
  if (cache) return cache;
  const jobs = read<{ jobs: FixtureJob[] }>(FIXTURE_FILES.jobs).jobs;
  const golden = new Map(
    read<{ records: GoldenExtractionRecord[] }>(FIXTURE_FILES.golden).records.map((r) => [r.jobId, r])
  );
  const keywords = new Map<string, string[]>();
  try {
    const art = read<{ perJob: Array<{ jobId: string; output: { keywords?: string[] } | null }> }>(FIXTURE_FILES.keywords);
    for (const p of art.perJob) keywords.set(p.jobId, p.output?.keywords ?? []);
  } catch {
    // Keywords are enrichment only; fixtures still build without them.
  }
  cache = { jobs, golden, keywords };
  return cache;
}

export function sampleJobs(): FixtureJob[] {
  return load().jobs;
}

export function goldenFor(jobId: string): GoldenExtractionRecord | undefined {
  return load().golden.get(jobId);
}

export function goldenRecords(): GoldenExtractionRecord[] {
  return [...load().golden.values()];
}

/** Golden fields re-shaped as the "already extracted" metadata downstream surfaces read. */
export function enriched(job: FixtureJob) {
  const g = goldenFor(job.id);
  const tech = (g?.expected.tech_required ?? []).map((t) => (Array.isArray(t) ? t[0] : t));
  return {
    function_category: (g?.expected.function_category ?? "other") as RoleCategory,
    seniority_level: g?.expected.seniority_level ?? null,
    standardized_department: g?.expected.standardized_department ?? null,
    tech_stack: tech,
    keywords: load().keywords.get(job.id) ?? [],
  };
}

function bySlug(): Map<string, FixtureJob[]> {
  const m = new Map<string, FixtureJob[]>();
  for (const j of sampleJobs()) m.set(j.company_slug, [...(m.get(j.company_slug) ?? []), j]);
  return m;
}

export function companyJobs(slug: string): FixtureJob[] {
  return bySlug().get(slug) ?? [];
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Stable synthetic first-seen dates (newest first) so prompts are identical across models. */
function firstSeen(index: number): string {
  return isoDaysAgo(6 + index * 17);
}

// ---------------------------------------------------------------------------
// Company-level context
// ---------------------------------------------------------------------------

export const COMPANY_TRUTH: Record<string, { isPublic: boolean | null; note: string }> = {
  "eq-bank": { isPublic: true, note: "EQ Bank is the digital arm of Equitable Group (TSX: EQB)." },
  koho: { isPublic: false, note: "Private, venture-backed." },
  bnc: { isPublic: true, note: "National Bank of Canada (TSX: NA)." },
  "neo-financial": { isPublic: false, note: "Private, venture-backed." },
  questrade: { isPublic: false, note: "Private." },
  rbc: { isPublic: true, note: "Royal Bank of Canada (TSX/NYSE: RY)." },
  // A wholly-owned Scotiabank subsidiary: "public" is defensible either way, so unscored.
  tangerine: { isPublic: null, note: "Wholly-owned subsidiary of Scotiabank (TSX/NYSE: BNS)." },
  wealthsimple: { isPublic: false, note: "Private." },
};

function functionStats(jobs: FixtureJob[]): FunctionStats[] {
  const counts = new Map<RoleCategory, number>();
  for (const j of jobs) {
    const c = enriched(j).function_category;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({
      category,
      label: getCategoryLabel(category),
      group: getCategoryGroup(category),
      count,
      percentage: Math.round((count / jobs.length) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

export function historicalContext(slug: string): HistoricalContext {
  const jobs = companyJobs(slug);
  const deptCounts = new Map<string, number>();
  for (const j of jobs) {
    const d = enriched(j).standardized_department ?? "Unknown";
    deptCounts.set(d, (deptCounts.get(d) ?? 0) + 1);
  }
  const execs = jobs.filter((j) => /\b(director|head|vp|chief|executive)\b/i.test(j.title));
  return {
    summary: `${jobs.length} postings observed for ${jobs[0]?.company_name} in the last 90 days (evaluation sample; the full corpus is larger).`,
    hiringTrends: [],
    recentExecutiveHires: execs.map((j, i) => ({
      title: j.title,
      standardized_department: enriched(j).standardized_department,
      firstSeenDate: firstSeen(i),
      description: j.description_text.slice(0, 280),
    })),
    departmentBreakdown: [...deptCounts.entries()].map(([d, count]) => ({
      standardized_department: d,
      count,
      percentage: Math.round((count / jobs.length) * 100),
    })),
    totalJobsInPeriod: jobs.length,
  };
}

export function extendedContext(slug: string): ExtendedHistoricalContext {
  const jobs = companyJobs(slug);
  const fns = functionStats(jobs);
  const tech = new Map<string, string[]>();
  for (const j of jobs) for (const t of enriched(j).tech_stack) tech.set(t, [...(tech.get(t) ?? []), j.title]);
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 90 * 86400_000);
  return {
    ...historicalContext(slug),
    functionBreakdown: fns,
    groupBreakdown: getGroupStats(fns),
    functionTrends: [],
    topTechnologies: [...tech.entries()].map(([name, titles]) => ({ name, count: titles.length, exampleTitles: titles })),
    notableRoleSignals: jobs.map((j, i) => ({ title: j.title, firstSeenDate: firstSeen(i), techStack: enriched(j).tech_stack })),
    periodStart,
    periodEnd,
  };
}

export const NO_RESEARCH: ResearchResult = {
  sources: [],
  qualityScore: 1,
  statedStrategy: null,
  financialContext: null,
  limitations: ["No external research was supplied for this evaluation; rely on hiring evidence only."],
  searchQueriesUsed: [],
  estimatedCost: 0,
};

export function editorialContext(slug: string): EditorialContext {
  const jobs = companyJobs(slug);
  const kw = new Map<string, number>();
  for (const j of jobs) for (const k of enriched(j).keywords) kw.set(k.toLowerCase(), (kw.get(k.toLowerCase()) ?? 0) + 1);
  const groups = new Map<string, number>();
  for (const j of jobs) {
    const g = getCategoryGroup(enriched(j).function_category);
    groups.set(g, (groups.get(g) ?? 0) + 1);
  }
  return {
    companyId: jobs[0]?.company_id ?? slug,
    companyName: jobs[0]?.company_name ?? slug,
    country: "Canada",
    ats: null,
    todayIso: isoDaysAgo(0),
    mostRecentPostingDate: firstSeen(0),
    activeJobs: jobs.length,
    totalJobs90d: jobs.length,
    sparkline: [0, 1, 0, 0, 1, 0, 0, 1],
    delta30d: 1,
    pivot: { kind: "cont", signals: [] },
    functionDist: [...groups.entries()].map(([group, count]) => ({ group, count })),
    topKeywords: [...kw.entries()].map(([keyword, count]) => ({ keyword, count })).slice(0, 30),
    sampleTitles: jobs.map((j) => j.title),
    recentJobLocations: jobs.map((j) => j.location ?? "").filter(Boolean),
    lastChangeFallback: null,
    research: null,
  };
}

// ---------------------------------------------------------------------------
// Cross-company + user-triggered surfaces
// ---------------------------------------------------------------------------

export function themeBundles(filter: (j: FixtureJob) => boolean = () => true): ThemeInputBundle[] {
  const groups = new Map<string, FixtureJob[]>();
  for (const j of sampleJobs().filter(filter)) {
    const g = getCategoryGroup(enriched(j).function_category);
    groups.set(g, [...(groups.get(g) ?? []), j]);
  }
  return [...groups.entries()].map(([group, jobs]) => {
    const kw = new Map<string, number>();
    for (const j of jobs) for (const k of enriched(j).keywords) kw.set(k.toLowerCase(), (kw.get(k.toLowerCase()) ?? 0) + 1);
    return {
      group,
      cos: new Set(jobs.map((j) => j.company_slug)).size,
      roles: jobs.length,
      keywords: [...kw.entries()].map(([keyword, count]) => ({ keyword, count })).sort((a, b) => b.count - a.count).slice(0, 15),
      sampleTitles: jobs.map((j) => j.title).slice(0, 8),
    };
  });
}

export function searchReportRequest(
  label: string,
  filter: (j: FixtureJob) => boolean,
  query: string | null,
  functionGroup: string | null
): SynthesisRequest {
  const jobs = sampleJobs().filter(filter);
  return {
    jobs: jobs.map((j) => {
      const e = enriched(j);
      return {
        id: j.id,
        title: j.title,
        companyName: j.company_name,
        companySlug: j.company_slug,
        functionGroup: getCategoryGroup(e.function_category),
        seniority: e.seniority_level,
        techStack: e.tech_stack,
        keywords: e.keywords,
        description: j.description_text.slice(0, 1800),
      };
    }),
    searchContext: { query, mode: "keyword", company: null, functionGroup, recency: "any", tier: "all", status: "active" },
    totalCount: jobs.length,
  };
}

interface FeedbackRow {
  id: string;
  type: string;
  title: string;
  description: string;
  page_url: string | null;
  status: string;
  triage_decision: string | null;
}

function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
}

function jaccardTokens(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  const inter = [...x].filter((t) => y.has(t)).length;
  return inter === 0 ? 0 : inter / (x.size + y.size - inter);
}

/**
 * Feedback triage cases. Duplicate candidates mimic the production trigram
 * shortlist: the three most title-similar other submissions.
 */
export function triageCases(): Array<{ submission: TriageSubmission; candidates: DuplicateCandidate[] }> {
  const rows = read<{ submissions: FeedbackRow[] }>(FIXTURE_FILES.feedback).submissions;
  return rows.map((r) => ({
    submission: { id: r.id, type: r.type, title: r.title, description: r.description, page_url: r.page_url },
    candidates: rows
      .filter((o) => o.id !== r.id)
      .map((o) => ({ o, s: jaccardTokens(r.title, o.title) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map(({ o }) => ({ id: o.id, title: o.title, triage_decision: o.triage_decision, status: o.status, github_issue_number: null })),
  }));
}

export function postingCases(): Array<{ id: string; jobs: PostingSourceJob[]; params: PostingParams }> {
  const all = sampleJobs();
  const pick = (idx: number[]) =>
    idx.map((i) => {
      const j = all[i];
      const e = enriched(j);
      return {
        title: j.title,
        company_name: j.company_name,
        description: j.description_text,
        seniority_level: e.seniority_level,
        tech_stack: e.tech_stack,
        keywords: e.keywords,
      };
    });
  return [
    { id: "backend-senior-professional", jobs: pick([2, 23]), params: { seniority: "senior", tone: "professional" } },
    { id: "risk-lead-conversational", jobs: pick([4, 5]), params: { seniority: "lead", tone: "conversational" } },
    { id: "field-sales-junior-startup", jobs: pick([9, 11]), params: { seniority: "junior", tone: "startup", companyName: "Northwind Card" } },
  ];
}

export function strategyLabJobs(slug: string): JobPosting[] {
  return companyJobs(slug).map((j, i) => ({
    id: j.id,
    title: j.title,
    department: j.department,
    function_category: enriched(j).function_category,
    location: j.location,
    first_seen_date: firstSeen(i),
    is_active: true,
    description_text: j.description_text,
  }));
}

export const CHAT_QUESTIONS = [
  "What is the strongest evidence behind the strategic hypothesis, and how confident should I be in it?",
  "Which roles would you watch over the next month to confirm or refute this read, and why?",
];

/** Representative per-job cases for grounded job analysis: one per company. */
export const JOB_ANALYSIS_INDEXES = [2, 4, 6, 10, 14, 16, 19, 23];
/** Companies used for company-level narrative surfaces (two fintechs, two banks). */
export const NARRATIVE_COMPANIES = ["koho", "wealthsimple", "eq-bank", "rbc"];
