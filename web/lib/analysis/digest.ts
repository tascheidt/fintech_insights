/**
 * Weekly Digest Generator
 *
 * Builds a job-led weekly digest that emphasizes objective role patterns,
 * continuity versus change, and simple language over strategic hype.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getVoiceDirective } from "@/lib/ai/voice";
import { checkVoice } from "@/lib/ai/voice-validator";
import { recordUsage } from "@/lib/ai/gemini-meter";
import { writeUsageEvent } from "@/lib/ai/gemini-telemetry";
import {
  getActiveWeeklyDigestAiConfig,
  type WeeklyDigestAiConfig,
} from "@/lib/ai/prompt-config";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  aggregateRoleThemes,
  type RoleThemeSummary,
} from "@/lib/analysis/role-themes";
import {
  DEFAULT_TIERS,
  type CompanyTier,
} from "@/lib/dashboard-queries";
import { isIncumbentSignalJob } from "@/lib/analysis/incumbent-signal";
import { getIncumbentTrackingEnabled } from "@/lib/settings/incumbent-tracking";
import { ROLE_CATEGORIES } from "@/lib/analysis/function-categories";

export type { RoleThemeSummary } from "@/lib/analysis/role-themes";
export { aggregateRoleThemes } from "@/lib/analysis/role-themes";

export interface WeeklyJob {
  id: string;
  title: string;
  url: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  standardized_department: string | null;
  seniority_level: string | null;
  tech_stack: string[];
  first_seen_date: string;
  is_active: boolean;
}

interface RawJobRow {
  id: string;
  title: string;
  url: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  standardized_department: string | null;
  seniority_level: string | null;
  tech_stack: unknown;
  first_seen_date: string;
  company_id: string;
  is_active: boolean;
  companies: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
}

interface HistoricalJobRow {
  company_id: string;
  title: string;
  standardized_department: string | null;
  is_active: boolean;
  first_seen_date: string;
}

/** AI-generated weekly company commentary (neutral voice — see docs/voice.md). */
export interface DigestCommentary {
  headline: string;
  body: string;
}

export interface WeeklyDigestCompanyInput {
  company_name: string;
  week_job_count: number;
  current_open_job_count: number;
  year_to_date_job_count: number;
  weekly_role_themes: RoleThemeSummary[];
  open_role_themes: RoleThemeSummary[];
  year_to_date_role_themes: RoleThemeSummary[];
  continuing_themes: string[];
  new_themes: string[];
  sample_titles: string[];
  continuity: "continuing" | "mixed" | "new_focus";
}

export type CompanyHiringPattern = WeeklyDigestCompanyInput;

export interface CompanyWeeklySummary {
  company_id: string;
  company_name: string;
  company_slug: string;
  new_job_count: number;
  current_open_job_count: number;
  year_to_date_job_count: number;
  departments: Record<string, number>;
  dominant_tech: string[];
  seniority_breakdown: Record<string, number>;
  ai_commentary: DigestCommentary;
  jobs: WeeklyJob[];
  hiring_pattern: CompanyHiringPattern;
}

export interface IndustryTrend {
  trend: string;
  explanation: string;
  companies: string[];
  jobCount: number;
  direction: "up" | "down" | "new";
}

export interface StrategySignal {
  company: string;
  alignment: "aligned" | "divergent" | "new_direction" | "unknown";
  signal: string;
  detail: string;
  interpretation: string;
}

export interface NotableMovement {
  type: "executive" | "expansion" | "scaling" | "other";
  company: string;
  description: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

export interface GlobalSummary extends DigestCommentary {
  key_insight: string;
}

/**
 * One bank's worth of "Incumbent Watch" digest data.
 *
 * `head` is the structured, always-present head bullet ("RBC · 3 senior
 * AI/ML & Data roles"). `interpretation` is the one-line AI prose; it is
 * `null` whenever the Flash call failed — the structured fallback ships the
 * head alone rather than dropping the block (see Surface 3 spec).
 */
export interface IncumbentWatchBank {
  company_id: string;
  company_name: string;
  company_slug: string;
  /** Count of senior signal roles (sum of collapsed role counts). */
  signal_role_count: number;
  /** Structured head bullet, e.g. "RBC · 3 senior AI/ML & Data roles". */
  head: string;
  /** One-line AI interpretation, or null when the Flash call failed. */
  interpretation: string | null;
}

/**
 * The "Incumbent Watch" weekly-digest block — a curated, clearly-bounded
 * interlude on senior big-bank hiring. Omitted entirely (null) when no
 * incumbent bank had a qualifying senior hire in the digest week.
 */
export interface IncumbentWatch {
  banks: IncumbentWatchBank[];
}

export interface WeeklyDigest {
  week_start: string;
  week_end: string;
  generated_at: string;
  total_jobs: number;
  total_companies: number;
  companies: CompanyWeeklySummary[];
  global_summary: GlobalSummary | null;
  industry_trends: IndustryTrend[];
  strategy_signals: StrategySignal[];
  notable_movements: NotableMovement[];
  /** Senior big-bank hiring interlude. null = no qualifying hires this week. */
  incumbent_watch: IncumbentWatch | null;
}

export interface CompanyJobData {
  company_id: string;
  company_name: string;
  company_slug: string;
  jobs: WeeklyJob[];
}

interface HistoricalPatternContext {
  currentOpenJobCount: number;
  yearToDateJobCount: number;
  openRoleThemes: RoleThemeSummary[];
  yearToDateRoleThemes: RoleThemeSummary[];
}

function getWeekBoundaries(): { weekStart: Date; weekEnd: Date } {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - daysToMonday - 7);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

function getYearStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
}

function parseTechStack(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function countOccurrences(items: (string | null | undefined)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item) counts[item] = (counts[item] || 0) + 1;
  }
  return counts;
}

function getTopTech(jobs: WeeklyJob[], topN: number = 3): string[] {
  const techCounts: Record<string, number> = {};
  for (const job of jobs) {
    for (const tech of job.tech_stack) {
      techCounts[tech] = (techCounts[tech] || 0) + 1;
    }
  }

  return Object.entries(techCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([tech]) => tech);
}

function formatRoleThemesForPrompt(themes: RoleThemeSummary[]): string {
  if (themes.length === 0) return "None";
  return themes
    .map((theme) => `- ${theme.label}: ${theme.count} (${theme.sample_titles.join("; ") || "no examples"})`)
    .join("\n");
}

function cleanJsonText(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return cleaned.trim();
}

function parseDigestCommentaryResponse(text: string, companyName: string): DigestCommentary {
  const cleaned = cleanJsonText(text);

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.headline && parsed.body) {
      return {
        headline: String(parsed.headline).replace(/\s+/g, " ").trim(),
        body: String(parsed.body).replace(/\s+/g, " ").trim(),
      };
    }
  } catch {
    // JSON was malformed or truncated — extract whatever fields are present
  }

  const headlineMatch = text.match(/"headline":\s*"([^"]+)"/);
  const bodyMatch = text.match(/"body":\s*"([^"]+)"/);
  if (headlineMatch && bodyMatch) {
    return {
      headline: headlineMatch[1].replace(/\s+/g, " ").trim(),
      body: bodyMatch[1].replace(/\s+/g, " ").trim(),
    };
  }

  // Truncated response: headline present but body cut off mid-string
  if (headlineMatch) {
    const partialBody = text.match(/"body":\s*"([\s\S]+)/);
    const recovered = partialBody
      ? partialBody[1].replace(/["}\s]+$/, "").replace(/\s+/g, " ").trim()
      : `${companyName} posted new roles this week.`;
    console.warn(`[digest] Recovered truncated response for ${companyName}`);
    return {
      headline: headlineMatch[1].replace(/\s+/g, " ").trim(),
      body: recovered,
    };
  }

  throw new Error(`Failed to parse weekly digest response for ${companyName}. Raw response: ${text.substring(0, 200)}`);
}

function buildWeeklyDigestPrompt(
  input: WeeklyDigestCompanyInput,
  config: WeeklyDigestAiConfig
): string {
  return config.promptTemplate
    .replace("{company_name}", input.company_name)
    .replace("{week_job_count}", String(input.week_job_count))
    .replace("{current_open_job_count}", String(input.current_open_job_count))
    .replace("{year_to_date_job_count}", String(input.year_to_date_job_count))
    .replace("{weekly_role_themes}", formatRoleThemesForPrompt(input.weekly_role_themes))
    .replace("{open_role_themes}", formatRoleThemesForPrompt(input.open_role_themes))
    .replace("{year_to_date_role_themes}", formatRoleThemesForPrompt(input.year_to_date_role_themes))
    .replace("{continuing_themes}", input.continuing_themes.join(", ") || "None")
    .replace("{new_themes}", input.new_themes.join(", ") || "None")
    .replace("{sample_titles}", input.sample_titles.join("; ") || "None");
}

export async function generateWeeklyDigestCommentary(
  input: WeeklyDigestCompanyInput,
  config?: WeeklyDigestAiConfig
): Promise<DigestCommentary> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY not configured - cannot generate weekly digest commentary");
  }

  const activeConfig = config ?? await getActiveWeeklyDigestAiConfig();
  const taskPrompt = buildWeeklyDigestPrompt(input, activeConfig);
  const prompt = `${getVoiceDirective("digest")}\n\n${taskPrompt}`;
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: activeConfig.model,
    generationConfig: {
      temperature: activeConfig.temperature,
      maxOutputTokens: activeConfig.maxOutputTokens,
    },
  });

  const _startMs = Date.now();
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  writeUsageEvent(
    recordUsage({
      callSite: "generateWeeklyDigestCommentary",
      modelRequested: activeConfig.model,
      groundingEnabled: false,
      usageMetadata: result.response.usageMetadata,
      latencyMs: Date.now() - _startMs,
      status: "ok",
      extra: { companyName: input.company_name },
    })
  );

  const text = result.response.text()?.trim();
  if (!text) {
    throw new Error(`Empty response from Gemini for ${input.company_name}`);
  }

  const commentary = parseDigestCommentaryResponse(text, input.company_name);
  const voice = checkVoice({
    headline: commentary.headline,
    body: commentary.body,
  });
  if (!voice.passed) {
    console.warn(
      `[voice] weekly digest commentary for ${input.company_name}:`,
      voice.warnings.join("; ")
    );
  }
  return commentary;
}

function buildGlobalSummary(
  companies: CompanyWeeklySummary[],
  industryTrends: IndustryTrend[],
  totalJobs: number
): GlobalSummary | null {
  if (companies.length === 0 || totalJobs === 0) {
    return null;
  }

  const continuingCompanies = companies.filter(
    (company) => company.hiring_pattern.continuity === "continuing"
  );
  const changingCompanies = companies.filter(
    (company) => company.hiring_pattern.continuity !== "continuing"
  );
  const leadTrend = industryTrends[0];

  const headline = leadTrend
    ? `${leadTrend.trend} remained the main hiring theme`
    : "Hiring patterns were mostly steady this week";

  const keyInsight = changingCompanies.length > 0
    ? `${changingCompanies[0].company_name} had the clearest new hiring signal this week, while most other companies continued established patterns.`
    : "Most companies continued established hiring patterns rather than opening clearly new role areas.";

  const bodyParts: string[] = [];
  if (leadTrend) {
    bodyParts.push(
      `${leadTrend.explanation}.`
    );
  }

  if (changingCompanies.length > 0) {
    const company = changingCompanies[0];
    bodyParts.push(
      `${company.company_name} stood out for ${company.hiring_pattern.new_themes.join(", ").toLowerCase() || "a new role mix"}, while ${continuingCompanies.slice(0, 2).map((entry) => entry.company_name).join(" and ") || "the rest of the group"} mostly continued existing hiring themes.`
    );
  } else {
    bodyParts.push(
      `${companies.slice(0, 3).map((company) => company.company_name).join(", ")} mainly added roles in areas they have already been hiring for this year.`
    );
  }

  return {
    headline,
    key_insight: keyInsight,
    body: bodyParts.join(" ").replace(/\s+/g, " ").trim(),
  };
}

async function getHistoricalPatternContext(
  companyIds: string[],
  weekStart: Date
): Promise<Map<string, HistoricalPatternContext>> {
  const supabase = createAdminClient();
  const yearStart = getYearStart();
  const result = new Map<string, HistoricalPatternContext>();

  if (companyIds.length === 0) return result;

  const [ytdResponse, activeResponse] = await Promise.all([
    supabase
      .from("active_job_postings")
      .select("company_id, title, standardized_department, is_active, first_seen_date")
      .in("company_id", companyIds)
      .gte("first_seen_date", yearStart.toISOString())
      .lt("first_seen_date", weekStart.toISOString()),
    supabase
      .from("active_job_postings")
      .select("company_id, title, standardized_department, is_active, first_seen_date")
      .in("company_id", companyIds)
      .eq("is_active", true),
  ]);

  if (ytdResponse.error) {
    throw new Error(`Failed to fetch historical digest context: ${ytdResponse.error.message}`);
  }

  if (activeResponse.error) {
    throw new Error(`Failed to fetch active job context: ${activeResponse.error.message}`);
  }

  const ytdJobsByCompany = new Map<string, HistoricalJobRow[]>();
  for (const row of (ytdResponse.data ?? []) as HistoricalJobRow[]) {
    const existing = ytdJobsByCompany.get(row.company_id) ?? [];
    existing.push(row);
    ytdJobsByCompany.set(row.company_id, existing);
  }

  const activeJobsByCompany = new Map<string, HistoricalJobRow[]>();
  for (const row of (activeResponse.data ?? []) as HistoricalJobRow[]) {
    const existing = activeJobsByCompany.get(row.company_id) ?? [];
    existing.push(row);
    activeJobsByCompany.set(row.company_id, existing);
  }

  for (const companyId of companyIds) {
    const ytdJobs = ytdJobsByCompany.get(companyId) ?? [];
    const activeJobs = activeJobsByCompany.get(companyId) ?? [];
    result.set(companyId, {
      currentOpenJobCount: activeJobs.length,
      yearToDateJobCount: ytdJobs.length,
      openRoleThemes: aggregateRoleThemes(activeJobs),
      yearToDateRoleThemes: aggregateRoleThemes(ytdJobs),
    });
  }

  return result;
}

export function buildWeeklyDigestCompanyInput(
  companyData: CompanyJobData,
  historicalContext: HistoricalPatternContext
): WeeklyDigestCompanyInput {
  const weeklyRoleThemes = aggregateRoleThemes(companyData.jobs);
  const historicalThemeIds = new Set(historicalContext.yearToDateRoleThemes.map((theme) => theme.id));

  const continuingThemes = weeklyRoleThemes
    .filter((theme) => historicalThemeIds.has(theme.id))
    .map((theme) => theme.label);
  const newThemes = weeklyRoleThemes
    .filter((theme) => !historicalThemeIds.has(theme.id))
    .map((theme) => theme.label);

  const continuity =
    newThemes.length === 0 ? "continuing" :
      continuingThemes.length === 0 ? "new_focus" :
        "mixed";

  const sampleTitles = companyData.jobs.slice(0, 6).map((job) => job.title);

  return {
    company_name: companyData.company_name,
    week_job_count: companyData.jobs.length,
    current_open_job_count: historicalContext.currentOpenJobCount,
    year_to_date_job_count: historicalContext.yearToDateJobCount,
    weekly_role_themes: weeklyRoleThemes,
    open_role_themes: historicalContext.openRoleThemes,
    year_to_date_role_themes: historicalContext.yearToDateRoleThemes,
    continuing_themes: continuingThemes,
    new_themes: newThemes,
    sample_titles: sampleTitles,
    continuity,
  };
}

export async function getWeeklyData(
  daysBack: number = 7,
  tiers: readonly CompanyTier[] = DEFAULT_TIERS,
): Promise<Map<string, CompanyJobData>> {
  const supabase = createAdminClient();
  const { weekStart, weekEnd } = getWeekBoundaries();
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - daysBack);

  // Tier filter (default fintech-only) keeps the digest's cross-company
  // themes from being skewed by big-bank volume.
  const query = supabase
    .from("active_job_postings")
    .select(`
      id,
      title,
      url,
      salary_min,
      salary_max,
      salary_currency,
      standardized_department,
      seniority_level,
      tech_stack,
      first_seen_date,
      company_id,
      is_active,
      companies!inner (
        id,
        name,
        slug,
        is_active,
        tier
      )
    `)
    .eq("companies.is_active", true)
    .in("companies.tier", [...tiers])
    .order("first_seen_date", { ascending: false });

  const { data: jobs, error } = daysBack === 7
    ? await query.gte("first_seen_date", weekStart.toISOString()).lte("first_seen_date", weekEnd.toISOString())
    : await query.gte("first_seen_date", cutoffDate.toISOString());

  if (error) {
    console.error("Error fetching weekly job data:", error);
    throw new Error(`Failed to fetch weekly data: ${error.message}`);
  }

  const companyMap = new Map<string, CompanyJobData>();
  for (const row of (jobs as unknown as RawJobRow[]) ?? []) {
    const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
    if (!company) continue;

    const companyId = company.id;
    const job: WeeklyJob = {
      id: row.id,
      title: row.title,
      url: row.url,
      salary_min: row.salary_min,
      salary_max: row.salary_max,
      salary_currency: row.salary_currency,
      standardized_department: row.standardized_department,
      seniority_level: row.seniority_level,
      tech_stack: parseTechStack(row.tech_stack),
      first_seen_date: row.first_seen_date,
      is_active: row.is_active,
    };

    if (!companyMap.has(companyId)) {
      companyMap.set(companyId, {
        company_id: companyId,
        company_name: company.name,
        company_slug: company.slug,
        jobs: [],
      });
    }

    companyMap.get(companyId)!.jobs.push(job);
  }

  return companyMap;
}

export function detectIndustryTrends(companies: CompanyWeeklySummary[]): IndustryTrend[] {
  const themeCounts = new Map<string, { label: string; count: number; companies: Set<string> }>();

  for (const company of companies) {
    for (const theme of company.hiring_pattern.weekly_role_themes) {
      const current = themeCounts.get(theme.id) ?? {
        label: theme.label,
        count: 0,
        companies: new Set<string>(),
      };
      current.count += theme.count;
      current.companies.add(company.company_name);
      themeCounts.set(theme.id, current);
    }
  }

  return Array.from(themeCounts.values())
    .filter((entry) => entry.companies.size >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((entry) => ({
      trend: entry.label,
      explanation: `${entry.count} roles across ${entry.companies.size} companies focused on ${entry.label.toLowerCase()}`,
      companies: Array.from(entry.companies),
      jobCount: entry.count,
      direction: "up" as const,
    }));
}

function buildStrategySignals(companies: CompanyWeeklySummary[]): StrategySignal[] {
  return companies
    .filter((company) => company.hiring_pattern.new_themes.length > 0)
    .slice(0, 3)
    .map((company) => ({
      company: company.company_name,
      alignment: "new_direction",
      signal: company.ai_commentary.headline,
      detail: company.ai_commentary.body,
      interpretation: `New this week: ${company.hiring_pattern.new_themes.join(", ").toLowerCase()}.`,
    }));
}

// ============================================================================
// Incumbent Watch — senior big-bank hiring interlude (Phase 2, Surface 3)
// ============================================================================

/** One gated incumbent signal job pulled for the Incumbent Watch block. */
interface IncumbentSignalJobRow {
  company_id: string;
  company_name: string;
  company_slug: string;
  title: string;
  seniority_level: string | null;
  function_category: string | null;
}

/** Per-bank accumulation while shaping the Incumbent Watch block. */
interface IncumbentBankAccum {
  company_id: string;
  company_name: string;
  company_slug: string;
  jobs: IncumbentSignalJobRow[];
}

/**
 * Build the short function descriptor for a bank's head bullet. The signal
 * whitelist spans AI/ML, Data & Analytics, and Risk-AI; we collapse the
 * present categories' high-level groups into a compact phrase like
 * "AI/ML & Data" or "AI/ML, Data & Risk-AI".
 */
function describeIncumbentFunctions(jobs: IncumbentSignalJobRow[]): string {
  const groups = new Set<string>();
  for (const job of jobs) {
    const cat = job.function_category;
    if (!cat || !(ROLE_CATEGORIES as readonly string[]).includes(cat)) continue;
    if (cat === "engineering-ai-ml") {
      groups.add("AI/ML");
    } else if (
      cat === "data-science" ||
      cat === "data-analytics-bi" ||
      cat === "analytics-engineering"
    ) {
      groups.add("Data");
    } else {
      // risk-management / compliance / aml-financial-crime
      groups.add("Risk-AI");
    }
  }
  // Stable, readable order.
  const order = ["AI/ML", "Data", "Risk-AI"];
  const present = order.filter((g) => groups.has(g));
  if (present.length === 0) return "senior";
  if (present.length === 1) return present[0];
  if (present.length === 2) return `${present[0]} & ${present[1]}`;
  return `${present[0]}, ${present[1]} & ${present[2]}`;
}

/** The always-present structured head bullet for a bank, e.g.
 *  "RBC · 3 senior AI/ML & Data roles". */
function buildIncumbentHead(
  companyName: string,
  signalRoleCount: number,
  jobs: IncumbentSignalJobRow[]
): string {
  const functions = describeIncumbentFunctions(jobs);
  const roleWord = signalRoleCount === 1 ? "role" : "roles";
  return `${companyName} · ${signalRoleCount} senior ${functions} ${roleWord}`;
}

/**
 * Fetch the gated incumbent slice for the digest week: `tier='incumbent'`
 * jobs first-seen in [weekStart, weekEnd], filtered by `isIncumbentSignalJob`
 * (staff+ in AI/ML / Data / Risk-AI). Grouped by bank, banks with no
 * qualifying role omitted.
 */
async function getIncumbentWatchJobs(
  weekStart: Date,
  weekEnd: Date
): Promise<IncumbentBankAccum[]> {
  const supabase = createAdminClient();

  const { data: jobs, error } = await supabase
    .from("active_job_postings")
    .select(
      `id, title, seniority_level, function_category, company_id,
       companies!inner ( id, name, slug, is_active, tier )`
    )
    .eq("companies.is_active", true)
    .eq("companies.tier", "incumbent")
    .gte("first_seen_date", weekStart.toISOString())
    .lte("first_seen_date", weekEnd.toISOString());

  if (error) {
    console.error("[digest] Failed to fetch incumbent watch jobs:", error);
    return [];
  }

  const byCompany = new Map<string, IncumbentBankAccum>();
  for (const row of jobs ?? []) {
    if (
      !isIncumbentSignalJob({
        seniority_level: row.seniority_level,
        function_category: row.function_category,
      })
    ) {
      continue;
    }
    const company = Array.isArray(row.companies)
      ? row.companies[0]
      : row.companies;
    if (!company) continue;
    // Defensive: the query filters tier='incumbent', but the block is a
    // strict incumbent lens — never group a non-incumbent row even if one
    // were ever returned.
    if ((company as { tier?: string }).tier !== "incumbent") continue;

    let accum = byCompany.get(row.company_id);
    if (!accum) {
      accum = {
        company_id: row.company_id,
        company_name: (company as { name: string }).name,
        company_slug: (company as { slug: string }).slug,
        jobs: [],
      };
      byCompany.set(row.company_id, accum);
    }
    accum.jobs.push({
      company_id: row.company_id,
      company_name: (company as { name: string }).name,
      company_slug: (company as { slug: string }).slug,
      title: row.title ?? "",
      seniority_level: row.seniority_level,
      function_category: row.function_category,
    });
  }

  // Banks sorted by signal volume — the bank investing most is read first.
  return Array.from(byCompany.values()).sort(
    (a, b) => b.jobs.length - a.jobs.length
  );
}

interface IncumbentWatchInterpretation {
  company_name: string;
  interpretation: string;
}

/**
 * One ungrounded Flash call writes a short interpretation line per bank for
 * the Incumbent Watch block. User-facing prose → the digest voice directive
 * applies. On any failure the caller falls back to the structured heads.
 */
async function generateIncumbentWatchInterpretations(
  banks: IncumbentBankAccum[],
  config: WeeklyDigestAiConfig
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (banks.length === 0) return result;

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn(
      "[digest] GEMINI_API_KEY not set — Incumbent Watch falls back to structured heads"
    );
    return result;
  }

  const bankSummaries = banks
    .map((bank) => {
      const titles = bank.jobs
        .map((j) => j.title)
        .filter(Boolean)
        .slice(0, 8)
        .join("; ");
      return `- ${bank.company_name} (${bank.jobs.length} senior signal roles): ${titles || "no titles"}`;
    })
    .join("\n");

  const taskPrompt = `You are writing the "Incumbent Watch" interlude in a weekly fintech hiring brief.

These are senior (staff+ / principal / lead / executive) roles that big incumbent banks posted this week, in AI/ML, Data, and Risk-AI functions only. This is a small, curated signal — not bank hiring volume.

Banks and their senior roles this week:
${bankSummaries}

For EACH bank, write exactly one short interpretation sentence (≤ 28 words) describing what the senior roles suggest the bank is staffing for — capability depth, governance, platform build, etc. Be concrete and grounded in the role titles. Do not mention total hiring volume. Do not invent roles not listed.

Respond with ONLY valid JSON, an array with one object per bank:
[{ "company_name": "RBC", "interpretation": "..." }]`;

  const prompt = `${getVoiceDirective("digest")}\n\n${taskPrompt}`;

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: config.model,
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
      },
    });

    const _startMs = Date.now();
    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    writeUsageEvent(
      recordUsage({
        callSite: "buildIncumbentWatch",
        modelRequested: config.model,
        groundingEnabled: false,
        usageMetadata: response.response.usageMetadata,
        latencyMs: Date.now() - _startMs,
        status: "ok",
        extra: { bankCount: banks.length },
      })
    );

    const text = response.response.text()?.trim();
    if (!text) return result;

    const parsed = JSON.parse(cleanJsonText(text)) as
      | IncumbentWatchInterpretation[]
      | unknown;
    if (!Array.isArray(parsed)) return result;

    const byName = new Map(
      banks.map((b) => [b.company_name.toLowerCase(), b.company_id])
    );
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const name = typeof e.company_name === "string" ? e.company_name : "";
      const interpretation =
        typeof e.interpretation === "string"
          ? e.interpretation.replace(/\s+/g, " ").trim()
          : "";
      if (!name || !interpretation) continue;
      const companyId = byName.get(name.toLowerCase());
      if (companyId) {
        const voice = checkVoice({ headline: name, body: interpretation });
        if (!voice.passed) {
          console.warn(
            `[voice] incumbent watch interpretation for ${name}:`,
            voice.warnings.join("; ")
          );
        }
        result.set(companyId, interpretation);
      }
    }
  } catch (error) {
    // Structured fallback — never let an AI failure drop the block.
    console.warn(
      "[digest] Incumbent Watch AI call failed; using structured fallback:",
      error
    );
  }

  return result;
}

/**
 * Build the "Incumbent Watch" digest block for the given week. Returns null
 * when no incumbent bank had a qualifying senior hire — the block (and its
 * surrounding dividers) is then omitted entirely. When structured data
 * exists but the Flash call fails, the block still ships with per-bank head
 * bullets and `interpretation: null`.
 */
export async function buildIncumbentWatch(
  weekStart: Date,
  weekEnd: Date,
  config?: WeeklyDigestAiConfig
): Promise<IncumbentWatch | null> {
  // Incumbent gate: when tracking is off, skip the block entirely (no grounded
  // interpretation calls). `null` is the existing "no qualifying hire" contract,
  // so the email template and DigestViewer already omit the section.
  if (!(await getIncumbentTrackingEnabled())) return null;

  const banks = await getIncumbentWatchJobs(weekStart, weekEnd);
  if (banks.length === 0) return null;

  const activeConfig = config ?? (await getActiveWeeklyDigestAiConfig());
  const interpretations = await generateIncumbentWatchInterpretations(
    banks,
    activeConfig
  );

  const watchBanks: IncumbentWatchBank[] = banks.map((bank) => {
    const signalRoleCount = bank.jobs.length;
    return {
      company_id: bank.company_id,
      company_name: bank.company_name,
      company_slug: bank.company_slug,
      signal_role_count: signalRoleCount,
      head: buildIncumbentHead(bank.company_name, signalRoleCount, bank.jobs),
      interpretation: interpretations.get(bank.company_id) ?? null,
    };
  });

  return { banks: watchBanks };
}

export async function generateWeeklyReport(
  weeklyData: Map<string, CompanyJobData>,
  parallelRequests: number = 3
): Promise<WeeklyDigest> {
  const { weekStart, weekEnd } = getWeekBoundaries();
  const config = await getActiveWeeklyDigestAiConfig();
  const historicalContexts = await getHistoricalPatternContext(Array.from(weeklyData.keys()), weekStart);
  const companies: CompanyWeeklySummary[] = [];
  const companyDataArray = Array.from(weeklyData.values());

  for (let i = 0; i < companyDataArray.length; i += parallelRequests) {
    const batch = companyDataArray.slice(i, i + parallelRequests);
    const batchResults = await Promise.allSettled(
      batch.map(async (companyData) => {
        const historicalContext = historicalContexts.get(companyData.company_id) ?? {
          currentOpenJobCount: companyData.jobs.filter((job) => job.is_active).length,
          yearToDateJobCount: 0,
          openRoleThemes: [],
          yearToDateRoleThemes: [],
        };
        const hiringPattern = buildWeeklyDigestCompanyInput(companyData, historicalContext);
        const aiCommentary = await generateWeeklyDigestCommentary(hiringPattern, config);

        return {
          company_id: companyData.company_id,
          company_name: companyData.company_name,
          company_slug: companyData.company_slug,
          new_job_count: companyData.jobs.length,
          current_open_job_count: hiringPattern.current_open_job_count,
          year_to_date_job_count: hiringPattern.year_to_date_job_count,
          departments: countOccurrences(companyData.jobs.map((job) => job.standardized_department)),
          dominant_tech: getTopTech(companyData.jobs, 3),
          seniority_breakdown: countOccurrences(companyData.jobs.map((job) => job.seniority_level)),
          ai_commentary: aiCommentary,
          jobs: companyData.jobs,
          hiring_pattern: hiringPattern,
        } satisfies CompanyWeeklySummary;
      })
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        companies.push(result.value);
      } else {
        console.error(`[digest] Skipping company due to AI error:`, result.reason);
      }
    }
  }

  companies.sort((a, b) => b.new_job_count - a.new_job_count);

  const totalJobs = companies.reduce((sum, company) => sum + company.new_job_count, 0);
  const industryTrends = detectIndustryTrends(companies);
  const strategySignals = buildStrategySignals(companies);
  const globalSummary = buildGlobalSummary(companies, industryTrends, totalJobs);

  // Incumbent Watch — gated big-bank senior-hiring interlude. A failure here
  // must never break the fintech-spined digest, so it degrades to null.
  let incumbentWatch: IncumbentWatch | null = null;
  try {
    incumbentWatch = await buildIncumbentWatch(weekStart, weekEnd, config);
  } catch (error) {
    console.error("[digest] Incumbent Watch build failed; omitting block:", error);
  }

  return {
    week_start: weekStart.toISOString(),
    week_end: weekEnd.toISOString(),
    generated_at: new Date().toISOString(),
    total_jobs: totalJobs,
    total_companies: companies.length,
    companies,
    global_summary: globalSummary,
    industry_trends: industryTrends,
    strategy_signals: strategySignals,
    notable_movements: [],
    incumbent_watch: incumbentWatch,
  };
}

export async function createWeeklyDigest(
  daysBack: number = 7,
  tiers: readonly CompanyTier[] = DEFAULT_TIERS,
): Promise<WeeklyDigest> {
  console.log(`Generating weekly digest for the last ${daysBack} days...`);
  const weeklyData = await getWeeklyData(daysBack, tiers);
  console.log(`Found ${weeklyData.size} companies with new job postings`);
  const digest = await generateWeeklyReport(weeklyData);
  console.log(`Generated digest with ${digest.total_jobs} total jobs`);
  return digest;
}
