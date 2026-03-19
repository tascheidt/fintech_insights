/**
 * Weekly Digest Generator
 *
 * Builds a job-led weekly digest that emphasizes objective role patterns,
 * continuity versus change, and simple language over strategic hype.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getActiveWeeklyDigestAiConfig,
  type WeeklyDigestAiConfig,
} from "@/lib/ai/prompt-config";
import { createAdminClient } from "@/lib/supabase/admin";

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

export interface TLDRCommentary {
  headline: string;
  body: string;
}

export interface RoleThemeSummary {
  id: string;
  label: string;
  count: number;
  sample_titles: string[];
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

export interface CompanyHiringPattern extends WeeklyDigestCompanyInput {}

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
  ai_commentary: TLDRCommentary;
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

export interface GlobalSummary extends TLDRCommentary {
  key_insight: string;
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

const ROLE_THEME_RULES = [
  { id: "ai_ml_risk", label: "AI and machine learning for risk", keywords: ["machine learning", "ml ", " ai ", "artificial intelligence", "decision science", "model risk", "risk model", "credit model", "fraud model"] },
  { id: "quality_engineering", label: "Quality engineering", keywords: ["quality engineer", "qa engineer", "software development engineer in test", "sdet", "test automation", "qa automation"] },
  { id: "risk_fraud", label: "Risk and fraud", keywords: ["risk", "fraud", "credit", "collections", "restructuring", "underwriting", "special loans"] },
  { id: "lending_mortgage", label: "Lending and mortgage", keywords: ["mortgage", "lending", "underwriter", "loan", "servicing"] },
  { id: "sales", label: "Sales", keywords: ["sales", "business development", "account executive", "account manager", "relationship manager", "regional manager"] },
  { id: "in_person_sales", label: "In-person sales", keywords: ["mall", "kiosk", "retail", "field sales", "sales representative", "brand ambassador", "grocery", "outlet"] },
  { id: "operations", label: "Operations", keywords: ["operations", "fulfillment", "coordinator", "specialist", "analyst", "servicing"] },
  { id: "support", label: "Support and customer service", keywords: ["support", "customer service", "customer experience", "contact centre", "call centre", "service representative"] },
  { id: "engineering", label: "Engineering", keywords: ["engineer", "developer", "software", "platform", "backend", "frontend", "full stack", "full-stack", "devops", "sre"] },
  { id: "product_design", label: "Product and design", keywords: ["product manager", "product owner", "designer", "ux", "ui", "research"] },
  { id: "finance", label: "Finance", keywords: ["finance", "accounting", "controller", "treasury", "fp&a", "financial analyst"] },
  { id: "compliance_legal", label: "Compliance and legal", keywords: ["compliance", "legal", "aml", "kyc", "regulatory", "privacy"] },
  { id: "leadership", label: "Leadership", keywords: ["vp", "vice president", "director", "head of", "chief", "principal"] },
] as const;

const DEPARTMENT_THEME_MAP: Record<string, string> = {
  Engineering: "engineering",
  Sales: "sales",
  Product: "product_design",
  Operations: "operations",
  Finance: "finance",
  Support: "support",
  "Customer Success": "support",
  Legal: "compliance_legal",
};

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

function normalizeTitle(text: string): string {
  return ` ${text.toLowerCase().replace(/[^\w\s]/g, " ")} `.replace(/\s+/g, " ");
}

function inferRoleThemeIds(title: string, department?: string | null): string[] {
  const normalized = normalizeTitle(title);
  const matches: string[] = ROLE_THEME_RULES
    .map((rule) => ({
      id: rule.id,
      score: rule.keywords.reduce(
        (total, keyword) => total + (normalized.includes(normalizeTitle(keyword)) ? 1 : 0),
        0
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.id);

  const departmentTheme = department ? DEPARTMENT_THEME_MAP[department] : undefined;
  if (departmentTheme && !matches.includes(departmentTheme)) {
    matches.push(departmentTheme);
  }

  if (matches.length === 0 && departmentTheme) {
    return [departmentTheme];
  }

  return matches.slice(0, 2);
}

export function aggregateRoleThemes(
  jobs: Array<Pick<WeeklyJob, "title" | "standardized_department">>
): RoleThemeSummary[] {
  const themeMap = new Map<string, { count: number; titles: string[] }>();

  for (const job of jobs) {
    const themeIds = inferRoleThemeIds(job.title, job.standardized_department);
    for (const themeId of themeIds) {
      const rule = ROLE_THEME_RULES.find((candidate) => candidate.id === themeId);
      if (!rule) continue;

      const current = themeMap.get(themeId) ?? { count: 0, titles: [] };
      current.count += 1;
      if (!current.titles.includes(job.title) && current.titles.length < 3) {
        current.titles.push(job.title);
      }
      themeMap.set(themeId, current);
    }
  }

  return Array.from(themeMap.entries())
    .map(([id, value]) => ({
      id,
      label: ROLE_THEME_RULES.find((rule) => rule.id === id)?.label ?? id,
      count: value.count,
      sample_titles: value.titles,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
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

function parseTLDRResponse(text: string, companyName: string): TLDRCommentary {
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
    const headlineMatch = text.match(/"headline":\s*"([^"]+)"/);
    const bodyMatch = text.match(/"body":\s*"([^"]+)"/);
    if (headlineMatch && bodyMatch) {
      return {
        headline: headlineMatch[1].replace(/\s+/g, " ").trim(),
        body: bodyMatch[1].replace(/\s+/g, " ").trim(),
      };
    }
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
): Promise<TLDRCommentary> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY not configured - cannot generate weekly digest commentary");
  }

  const activeConfig = config ?? await getActiveWeeklyDigestAiConfig();
  const prompt = buildWeeklyDigestPrompt(input, activeConfig);
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: activeConfig.model,
    generationConfig: {
      temperature: activeConfig.temperature,
      maxOutputTokens: activeConfig.maxOutputTokens,
    },
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const text = result.response.text()?.trim();
  if (!text) {
    throw new Error(`Empty response from Gemini for ${input.company_name}`);
  }

  return parseTLDRResponse(text, input.company_name);
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
      .from("job_postings")
      .select("company_id, title, standardized_department, is_active, first_seen_date")
      .in("company_id", companyIds)
      .gte("first_seen_date", yearStart.toISOString())
      .lt("first_seen_date", weekStart.toISOString()),
    supabase
      .from("job_postings")
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
  const weeklyThemeIds = new Set(weeklyRoleThemes.map((theme) => theme.id));
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

export async function getWeeklyData(daysBack: number = 7): Promise<Map<string, CompanyJobData>> {
  const supabase = createAdminClient();
  const { weekStart, weekEnd } = getWeekBoundaries();
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - daysBack);

  const query = supabase
    .from("job_postings")
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
        is_active
      )
    `)
    .eq("companies.is_active", true)
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
      signal: `${company.company_name} added ${company.hiring_pattern.new_themes.join(", ").toLowerCase()} roles this week`,
      detail:
        company.hiring_pattern.continuing_themes.length > 0
          ? `This sits alongside continuing hiring in ${company.hiring_pattern.continuing_themes.join(", ").toLowerCase()}.`
          : "This theme did not show up in the company's earlier year-to-date hiring pattern.",
      interpretation:
        company.hiring_pattern.continuity === "new_focus"
          ? "This looks like the clearest change in role focus this week."
          : "This is worth watching, but it appears alongside an established hiring pattern.",
    }));
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
    const batchResults = await Promise.all(
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

    companies.push(...batchResults);
  }

  companies.sort((a, b) => b.new_job_count - a.new_job_count);

  const totalJobs = companies.reduce((sum, company) => sum + company.new_job_count, 0);
  const industryTrends = detectIndustryTrends(companies);
  const strategySignals = buildStrategySignals(companies);
  const globalSummary = buildGlobalSummary(companies, industryTrends, totalJobs);

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
  };
}

export async function createWeeklyDigest(daysBack: number = 7): Promise<WeeklyDigest> {
  console.log(`Generating weekly digest for the last ${daysBack} days...`);
  const weeklyData = await getWeeklyData(daysBack);
  console.log(`Found ${weeklyData.size} companies with new job postings`);
  const digest = await generateWeeklyReport(weeklyData);
  console.log(`Generated digest with ${digest.total_jobs} total jobs`);
  return digest;
}
