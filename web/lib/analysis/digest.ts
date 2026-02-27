/**
 * Weekly Digest Generator with AI Analysis
 * 
 * Generates weekly reports combining raw job data with AI-generated strategic commentary.
 * Uses Gemini Pro for strategic analysis of each company's hiring patterns.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { batchGetCachedNews, emptyNewsContext } from "./company-news";
import { analyzeStrategyAlignment } from "./strategy-alignment";

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Partial job object for weekly summaries
 */
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
}

/**
 * Raw job data from the database (Supabase returns nested joins as arrays)
 */
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
  companies: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
}

/**
 * AI-generated TLDR commentary with headline and body
 */
export interface TLDRCommentary {
  headline: string;
  body: string;
}

/**
 * Company weekly summary with AI-generated commentary
 */
export interface CompanyWeeklySummary {
  company_id: string;
  company_name: string;
  company_slug: string;
  new_job_count: number;
  departments: Record<string, number>;
  dominant_tech: string[];
  seniority_breakdown: Record<string, number>;
  ai_commentary: TLDRCommentary;
  jobs: WeeklyJob[];
}

/**
 * Industry trend detected across companies
 */
export interface IndustryTrend {
  trend: string;           // e.g., "AI/ML hiring surge"
  explanation: string;      // Why this matters strategically
  companies: string[];      // Companies driving this trend
  jobCount: number;         // Jobs supporting this trend
  direction: "up" | "down" | "new";
}

/**
 * Strategy alignment signal for a company
 */
export interface StrategySignal {
  company: string;
  alignment: "aligned" | "divergent" | "new_direction" | "unknown";
  signal: string;           // Brief signal description
  detail: string;           // Detailed explanation
  interpretation: string;    // What this means strategically
}

/**
 * Notable movement (executive hire, expansion, etc.)
 */
export interface NotableMovement {
  type: "executive" | "expansion" | "scaling" | "other";
  company: string;
  description: string;
  sourceUrl?: string;  // Link to external article/source if available
  sourceTitle?: string; // Title of the source article
}

/**
 * Enhanced global summary with key insight
 */
export interface GlobalSummary extends TLDRCommentary {
  key_insight: string;      // The single most important thing to know
}

/**
 * Weekly digest containing all company summaries
 */
export interface WeeklyDigest {
  week_start: string;
  week_end: string;
  generated_at: string;
  total_jobs: number;
  total_companies: number;
  companies: CompanyWeeklySummary[];
  /** 
   * AI-generated global summary synthesizing trends across all companies.
   * May be null if generation fails (we prefer omission over generic fallback).
   */
  global_summary: GlobalSummary | null;
  /**
   * Industry trends detected across all companies
   */
  industry_trends: IndustryTrend[];
  /**
   * Strategy alignment signals - key differentiator
   */
  strategy_signals: StrategySignal[];
  /**
   * Notable movements (executives, expansions, etc.)
   */
  notable_movements: NotableMovement[];
}

/**
 * Intermediate structure for organizing data by company
 */
export interface CompanyJobData {
  company_id: string;
  company_name: string;
  company_slug: string;
  jobs: WeeklyJob[];
}

// ============================================================================
// Data Fetcher
// ============================================================================

/**
 * Fetches job postings from the last 7 days grouped by company
 * 
 * @param daysBack - Number of days to look back (default: 7)
 * @returns Map of company data with their jobs
 */
export async function getWeeklyData(daysBack: number = 7): Promise<Map<string, CompanyJobData>> {
  const supabase = createAdminClient();
  
  // Calculate the cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffIso = cutoffDate.toISOString();

  // Query job postings with company data
  // Only include companies that are active
  const { data: jobs, error } = await supabase
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
      companies!inner (
        id,
        name,
        slug,
        is_active
      )
    `)
    .gte("first_seen_date", cutoffIso)
    .eq("is_active", true)
    .eq("companies.is_active", true)
    .order("first_seen_date", { ascending: false });

  if (error) {
    console.error("Error fetching weekly job data:", error);
    throw new Error(`Failed to fetch weekly data: ${error.message}`);
  }

  // Group jobs by company
  const companyMap = new Map<string, CompanyJobData>();

  for (const row of (jobs as unknown as RawJobRow[]) ?? []) {
    // Supabase returns inner joins as arrays, get first element
    const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
    if (!company) continue;

    const companyId = company.id;
    
    // Parse tech_stack (could be JSONB array or null)
    let techStack: string[] = [];
    if (row.tech_stack) {
      if (Array.isArray(row.tech_stack)) {
        techStack = row.tech_stack.map(String);
      } else if (typeof row.tech_stack === "string") {
        try {
          const parsed = JSON.parse(row.tech_stack);
          techStack = Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          techStack = [];
        }
      }
    }

    const job: WeeklyJob = {
      id: row.id,
      title: row.title,
      url: row.url,
      salary_min: row.salary_min,
      salary_max: row.salary_max,
      salary_currency: row.salary_currency,
      standardized_department: row.standardized_department,
      seniority_level: row.seniority_level,
      tech_stack: techStack,
      first_seen_date: row.first_seen_date,
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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Count occurrences in an array, returning a Record
 */
function countOccurrences(items: (string | null | undefined)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item) {
      counts[item] = (counts[item] || 0) + 1;
    }
  }
  return counts;
}

/**
 * Get top N items from a tech stack frequency map
 */
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

/**
 * Build a summary object for AI analysis
 */
function buildCompanySummaryForAI(data: CompanyJobData): {
  departments: Record<string, number>;
  seniority_breakdown: Record<string, number>;
  dominant_tech: string[];
  job_titles: string[];
} {
  const departments = countOccurrences(data.jobs.map(j => j.standardized_department));
  const seniority_breakdown = countOccurrences(data.jobs.map(j => j.seniority_level));
  const dominant_tech = getTopTech(data.jobs, 5);
  const job_titles = data.jobs.map(j => j.title);

  return { departments, seniority_breakdown, dominant_tech, job_titles };
}

// ============================================================================
// Longitudinal Context — Previous Digests
// ============================================================================

interface PreviousDigestSummary {
  week_start: string;
  week_end: string;
  global_summary: GlobalSummary | null;
  company_headlines: Array<{ company_name: string; headline: string; job_count: number }>;
}

/**
 * Fetches the last N weekly digests for longitudinal context.
 * Skips the current week so we only get prior history.
 */
async function getPreviousDigests(count: number = 3): Promise<PreviousDigestSummary[]> {
  const supabase = createAdminClient();

  // Get Monday of current week to exclude it
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const currentWeekStart = new Date(now);
  currentWeekStart.setUTCDate(now.getUTCDate() - daysToMonday);
  currentWeekStart.setUTCHours(0, 0, 0, 0);

  const { data: digests, error } = await supabase
    .from("weekly_digests")
    .select(`
      week_start,
      week_end,
      global_summary,
      weekly_digest_companies (
        headline,
        new_job_count,
        company_id,
        companies:company_id (
          name
        )
      )
    `)
    .lt("week_start", currentWeekStart.toISOString())
    .order("week_start", { ascending: false })
    .limit(count);

  if (error) {
    console.warn("Failed to fetch previous digests for longitudinal context:", error.message);
    return [];
  }

  return (digests ?? []).map((d) => ({
    week_start: d.week_start,
    week_end: d.week_end,
    global_summary: d.global_summary as GlobalSummary | null,
    company_headlines: (
      (d.weekly_digest_companies as unknown as Array<{
        headline: string;
        new_job_count: number;
        companies: { name: string } | Array<{ name: string }>;
      }>) ?? []
    ).map((c) => {
      const company = Array.isArray(c.companies) ? c.companies[0] : c.companies;
      return {
        company_name: company?.name ?? "Unknown",
        headline: c.headline,
        job_count: c.new_job_count,
      };
    }),
  }));
}

/**
 * Format previous digests into a prompt-friendly string for company-level context.
 */
function formatPreviousDigestsForCompany(
  previousDigests: PreviousDigestSummary[],
  companyName: string
): string {
  if (previousDigests.length === 0) return "";

  const lines = previousDigests.map((d) => {
    const weekLabel = new Date(d.week_start).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const companyEntry = d.company_headlines.find(
      (c) => c.company_name.toLowerCase() === companyName.toLowerCase()
    );
    if (companyEntry) {
      return `- Week of ${weekLabel}: ${companyEntry.company_name} (${companyEntry.job_count} jobs, "${companyEntry.headline}")`;
    }
    return `- Week of ${weekLabel}: No activity for ${companyName}`;
  });

  return `\n## Recent Weeks (for context — identify longitudinal trends):\n${lines.join("\n")}\nUse the recent weeks as context. If hiring is accelerating, decelerating, or shifting focus week-over-week, note it. If this week continues an existing trend, say so. If it is a departure, highlight the change.`;
}

/**
 * Format previous digests into a prompt-friendly string for global summary context.
 */
function formatPreviousDigestsForGlobal(previousDigests: PreviousDigestSummary[]): string {
  if (previousDigests.length === 0) return "";

  const lines = previousDigests.map((d) => {
    const weekLabel = new Date(d.week_start).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const totalJobs = d.company_headlines.reduce((sum, c) => sum + c.job_count, 0);
    const topCompanies = d.company_headlines
      .sort((a, b) => b.job_count - a.job_count)
      .slice(0, 3)
      .map((c) => `${c.company_name} (${c.job_count})`)
      .join(", ");
    const theme = d.global_summary?.headline ?? "No summary";
    return `- Week of ${weekLabel}: ${totalJobs} total jobs | Top: ${topCompanies} | Theme: "${theme}"`;
  });

  return `\n## Recent Weeks (for longitudinal context):\n${lines.join("\n")}\nNote whether this week represents acceleration, continuation, or a shift from recent trends.`;
}

// ============================================================================
// Company Insights Context
// ============================================================================

interface CompanyInsightContext {
  strategic_hypothesis: string;
  key_signal: string;
  headline: string;
  generated_at: string;
}

/**
 * Fetches the most recent company insight for each given company ID.
 * Returns a Map keyed by company_id.
 */
async function getCompanyInsightsContext(
  companyIds: string[]
): Promise<Map<string, CompanyInsightContext>> {
  if (companyIds.length === 0) return new Map();

  const supabase = createAdminClient();
  const result = new Map<string, CompanyInsightContext>();

  // Fetch the most recent insight per company using distinct on
  const { data, error } = await supabase
    .from("company_insights")
    .select("company_id, strategic_hypothesis, key_signal, headline, generated_at")
    .in("company_id", companyIds)
    .order("generated_at", { ascending: false });

  if (error) {
    console.warn("Failed to fetch company insights context:", error.message);
    return result;
  }

  // Take the most recent per company (data is ordered by generated_at desc)
  const seen = new Set<string>();
  for (const row of data ?? []) {
    if (row.company_id && !seen.has(row.company_id)) {
      seen.add(row.company_id);
      result.set(row.company_id, {
        strategic_hypothesis: row.strategic_hypothesis,
        key_signal: row.key_signal ?? "",
        headline: row.headline ?? "",
        generated_at: row.generated_at,
      });
    }
  }

  return result;
}

/**
 * Format a company's insight context into a prompt-friendly string.
 */
function formatInsightForCompany(insight: CompanyInsightContext | undefined): string {
  if (!insight) return "";

  const age = Math.round(
    (Date.now() - new Date(insight.generated_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  return `\n## 90-Day Strategic Context (from deep analysis, ${age} days ago):
Strategic hypothesis: "${insight.strategic_hypothesis}"
Key signal: "${insight.key_signal}"
If this context is available, reference it. Does this week's hiring reinforce or contradict the longer-term strategic direction? This is how you provide truly differentiated insight.`;
}

/**
 * Format company insights for the global summary prompt.
 */
function formatInsightsForGlobal(
  companies: CompanyWeeklySummary[],
  insightsMap: Map<string, CompanyInsightContext>
): string {
  const entries: string[] = [];
  for (const c of companies) {
    const insight = insightsMap.get(c.company_id);
    if (insight) {
      entries.push(`- ${c.company_name}: "${insight.strategic_hypothesis}" (key signal: "${insight.key_signal}")`);
    }
  }
  if (entries.length === 0) return "";

  return `\n## Company Strategic Context (90-day deep analysis):\n${entries.join("\n")}`;
}

// ============================================================================
// Industry Trend Detection
// ============================================================================

/**
 * Detect industry-wide trends from job posting data
 */
export async function detectIndustryTrends(
  weeklyData: Map<string, CompanyJobData>
): Promise<IndustryTrend[]> {
  const trends: IndustryTrend[] = [];
  
  // Aggregate data across all companies
  const allJobs: WeeklyJob[] = [];
  const functionCounts: Record<string, { count: number; companies: Set<string> }> = {};
  const techCounts: Record<string, { count: number; companies: Set<string> }> = {};
  const seniorityCounts: Record<string, number> = {};
  const locationCounts: Record<string, number> = {};
  
  for (const companyData of weeklyData.values()) {
    for (const job of companyData.jobs) {
      allJobs.push(job);
      
      // Count functions (departments)
      if (job.standardized_department) {
        if (!functionCounts[job.standardized_department]) {
          functionCounts[job.standardized_department] = { count: 0, companies: new Set() };
        }
        functionCounts[job.standardized_department].count++;
        functionCounts[job.standardized_department].companies.add(companyData.company_name);
      }
      
      // Count tech stack
      for (const tech of job.tech_stack) {
        if (!techCounts[tech]) {
          techCounts[tech] = { count: 0, companies: new Set() };
        }
        techCounts[tech].count++;
        techCounts[tech].companies.add(companyData.company_name);
      }
      
      // Count seniority
      if (job.seniority_level) {
        seniorityCounts[job.seniority_level] = (seniorityCounts[job.seniority_level] || 0) + 1;
      }
    }
  }
  
  // Identify top functions (trending across multiple companies)
  const topFunctions = Object.entries(functionCounts)
    .filter(([_, data]) => data.companies.size >= 2) // At least 2 companies
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);
  
  for (const [functionName, data] of topFunctions) {
    trends.push({
      trend: `${functionName} hiring surge`,
      explanation: `${data.count} new ${functionName} roles across ${data.companies.size} companies`,
      companies: Array.from(data.companies),
      jobCount: data.count,
      direction: "up",
    });
  }
  
  // Identify emerging tech trends
  const topTech = Object.entries(techCounts)
    .filter(([_, data]) => data.companies.size >= 2 && data.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3);
  
  for (const [tech, data] of topTech) {
    trends.push({
      trend: `${tech} adoption`,
      explanation: `${data.count} roles requiring ${tech} across ${data.companies.size} companies`,
      companies: Array.from(data.companies),
      jobCount: data.count,
      direction: "new",
    });
  }
  
  // Executive-tier seniority trend: only flag if executive/principal roles appear across 2+ companies
  const executiveTierCounts: Record<string, Set<string>> = {};
  for (const companyData of weeklyData.values()) {
    for (const job of companyData.jobs) {
      const level = job.seniority_level;
      if (level === "executive" || level === "principal") {
        if (!executiveTierCounts[level]) {
          executiveTierCounts[level] = new Set();
        }
        executiveTierCounts[level].add(companyData.company_name);
      }
    }
  }

  const executiveCompanies = new Set<string>();
  let executiveJobCount = 0;
  for (const [level, companies] of Object.entries(executiveTierCounts)) {
    if (companies.size >= 2) {
      for (const c of companies) executiveCompanies.add(c);
      executiveJobCount += seniorityCounts[level] || 0;
    }
  }

  if (executiveCompanies.size >= 2 && executiveJobCount > 0) {
    trends.push({
      trend: "Executive-level hiring across sector",
      explanation: `${executiveJobCount} VP/Principal-level roles across ${executiveCompanies.size} companies signal strategic leadership investment`,
      companies: Array.from(executiveCompanies),
      jobCount: executiveJobCount,
      direction: "up",
    });
  }
  
  return trends.slice(0, 5); // Return top 5 trends
}

// ============================================================================
// AI Analyst Function - Company Commentary
// ============================================================================

const TLDR_PROMPT = `You are a senior fintech analyst writing a concise intelligence briefing. Your style is evidence-based, interpretive, and professional — like a Stratechery or analyst note. No slang, no puns, no wordplay. Minimal emoji (one at most, and only if it genuinely aids comprehension).

## Company: {company_name}

## This Week's Hiring Data:
- Total New Postings: {job_count}
- Departments: {departments}
- Seniority Levels: {seniority_breakdown}
- Top Technologies: {tech_stack}
- All Job Titles: {job_titles}
{previous_context}
{insight_context}

## Your Task:
Write a brief analyst note interpreting the strategic signal behind this week's hiring activity.

**Headline guidance:**
- State the strategic move clearly and specifically (6-12 words)
- Good: "Wealthsimple accelerates crypto and wealth hiring"
- Good: "EQ Bank signals lending expansion with 6 new risk roles"
- Good: "Questrade expands wealth platform with 4 engineering and 2 product hires"
- Bad: "Wealthsimple hits the gas" (vague, slangy)
- Bad: "EQ Bank is hiring" (obvious, no insight)
- Bad: "[Company] expands team" (generic)
- Emoji is optional — omit unless it genuinely clarifies (e.g., a flag for geographic expansion)

**Body guidance (2-3 sentences of strategic interpretation):**
- Use cause-and-effect framing: "The mix of X and Y roles suggests Z", "This hiring pattern indicates..."
- Be specific about role types: "3 ML engineers focused on fraud detection" is better than "ramping up engineering"
- Name exact role titles that drive the insight when possible
- If 90-day strategic context is available, reference it: does this week reinforce or contradict the longer-term direction?
- If previous week data is available, note acceleration, deceleration, or strategic shifts

**Seniority — only comment when strategically meaningful:**
- Executive tier (VP, Director, C-suite, Principal): Always notable — "VP-level hires signal strategic leadership investment"
- Staff/Lead tier: Notable only if concentrated in one area — "3 Staff Engineers in payments suggests platform rebuild"
- Senior IC tier: Only mention if combined with department concentration — "4 senior fraud engineers" is notable, "a mix of senior roles" is not
- Mid/Junior tier: Only mention if dominant (>60%), suggesting new team buildout or scale-up
- DEFAULT: Do NOT comment on seniority if it is a normal mix. A blend of senior and mid-level roles is unremarkable.

**Role specificity:**
- When referencing job types, identify the specific KIND of work they reveal strategically
- Use the full job title list to identify clusters, not just department labels
- "3 fraud ML engineers and 2 compliance analysts" reveals a regulatory-tech investment
- "ramping up engineering" reveals nothing

**Output JSON:**
{
  "headline": "Clear analytical headline (6-12 words, no emoji required) stating the strategic move",
  "body": "2-3 sentences of strategic interpretation. What does the hiring pattern reveal about the company's direction? Be specific about roles and what they signal."
}

**Example of desired output:**
{
  "headline": "Questrade expands wealth platform with 4 engineering and 2 product hires",
  "body": "The concentration of full-stack and platform engineering roles alongside product management suggests Questrade is investing in its core trading platform rather than adjacent products. The absence of compliance hires is notable given recent regulatory changes — the company appears to be betting on product differentiation over regulatory readiness."
}

**Self-check before responding:**
1. Would a fintech professional find this analytically useful?
2. Does it identify a specific strategic signal, not just summarize the data?
3. Are role references specific (named titles/clusters) rather than generic ("engineering roles")?
4. Is seniority commentary earned — or just restating the breakdown?

Respond with ONLY valid JSON, no markdown.`;

/**
 * Clean JSON text by removing markdown code blocks
 */
function cleanJsonText(text: string): string {
  let cleaned = text.trim();
  // Remove markdown code blocks
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return cleaned.trim();
}

/**
 * Parse AI response into TLDRCommentary
 * Throws if parsing fails - we want to surface failures, not mask them.
 */
function parseTLDRResponse(text: string, companyName: string): TLDRCommentary {
  // Try to clean and parse JSON
  const cleaned = cleanJsonText(text);
  
  try {
    const parsed = JSON.parse(cleaned);
    
    if (parsed.headline && parsed.body) {
      return {
        headline: String(parsed.headline).slice(0, 100),
        body: String(parsed.body).slice(0, 500),
      };
    }
  } catch {
    // If JSON parsing fails, try regex extraction as fallback
    const headlineMatch = text.match(/"headline":\s*"([^"]+)"/);
    const bodyMatch = text.match(/"body":\s*"([^"]+)"/);
    
    if (headlineMatch && bodyMatch) {
      return {
        headline: headlineMatch[1].slice(0, 100),
        body: bodyMatch[1].slice(0, 500),
      };
    }
  }
  
  // Parsing failed - throw so we can address the root cause
  throw new Error(`Failed to parse TLDR response for ${companyName}. Raw response: ${text.substring(0, 200)}`);
}

/**
 * Generate analyst-style AI commentary for a single company's weekly hiring data.
 * Throws on failure - we want to surface and fix issues, not mask them with fallbacks.
 */
async function generateCompanyCommentary(
  companyName: string,
  summary: {
    departments: Record<string, number>;
    seniority_breakdown: Record<string, number>;
    dominant_tech: string[];
    job_titles: string[];
  },
  jobCount: number,
  previousDigests?: PreviousDigestSummary[],
  companyInsight?: CompanyInsightContext
): Promise<TLDRCommentary> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY not configured - cannot generate AI commentary");
  }

  const previousContext = formatPreviousDigestsForCompany(previousDigests ?? [], companyName);
  const insightContext = formatInsightForCompany(companyInsight);

  const prompt = TLDR_PROMPT
    .replace("{company_name}", companyName)
    .replace("{job_count}", String(jobCount))
    .replace("{departments}", JSON.stringify(summary.departments))
    .replace("{seniority_breakdown}", JSON.stringify(summary.seniority_breakdown))
    .replace("{tech_stack}", summary.dominant_tech.join(", ") || "Not specified")
    .replace("{job_titles}", summary.job_titles.join(", "))
    .replace("{previous_context}", previousContext)
    .replace("{insight_context}", insightContext);

  const genAI = new GoogleGenerativeAI(key);
  
  // Use Gemini 3 Flash Preview
  const model = genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 64000,
    },
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const text = result.response.text()?.trim();
  if (!text) {
    throw new Error(`Empty response from Gemini for ${companyName}`);
  }
  
  return parseTLDRResponse(text, companyName);
}

// ============================================================================
// Global Summary - Cross-Company Trend Analysis
// ============================================================================

/**
 * Prompt for generating a global summary that synthesizes trends across all companies.
 * This is the "TL;DR of TL;DRs" - a high-level view of what's happening in the market.
 */
const GLOBAL_SUMMARY_PROMPT = `You are an elite fintech analyst creating a weekly intelligence brief. Write in an objective, evidence-based style. Avoid puns, wordplay, and emojis.

## This Week's Hiring Data:
- Total new jobs: {total_jobs} across {company_count} companies
- Top companies: {top_companies}
- Detected trends: {trends}

## Company Summaries:
{company_summaries}
{previous_context}
{insights_context}

## Your Task:
Create an industry-level intelligence brief that answers:
1. What is the most significant hiring pattern across companies this week?
2. Why does it matter for the Canadian fintech competitive landscape?
3. What is the single most actionable takeaway for someone tracking competitive dynamics?

**Output a JSON object with exactly these fields:**
{
  "headline": "Clear analytical headline (8-12 words, no emoji required)",
  "key_insight": "The single most actionable takeaway for someone tracking Canadian fintech competitive dynamics (one sentence)",
  "body": "2-3 sentences synthesizing the key pattern(s). Explain WHY the pattern matters, not just WHAT you observe. Reference specific companies and role types."
}

**Guidelines:**
- Focus on cross-company patterns and what they reveal about industry direction
- Identify the most significant signal and explain its implications
- If previous week data is available, note whether this week represents acceleration, continuation, or a shift from recent trends
- If company strategic context is available, reference whether industry hiring aligns with or diverges from stated strategies
- Be specific: name companies, role types, and the strategic interpretation
- If there's no clear theme, note the diversity and what it suggests about market maturity

Respond with ONLY valid JSON, no markdown formatting.`;

/**
 * Build a condensed summary of each company for the global summary prompt.
 */
function buildCompanySummariesForGlobalPrompt(companies: CompanyWeeklySummary[]): string {
  return companies
    .map((c) => {
      const topDepts = Object.entries(c.departments)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([d]) => d)
        .join(", ") || "Various";
      const tech = c.dominant_tech.slice(0, 3).join(", ") || "Various";
      return `- **${c.company_name}**: ${c.new_job_count} jobs | Focus: ${topDepts} | Tech: ${tech} | "${c.ai_commentary.headline}"`;
    })
    .join("\n");
}

/**
 * Generate a global summary that synthesizes trends across all companies.
 * Returns null if generation fails (we prefer omission over generic fallback).
 *
 * @param companies - Array of company summaries with their AI commentary
 * @param totalJobs - Total number of new jobs across all companies
 * @param industryTrends - Detected industry trends
 * @param previousDigests - Previous week digests for longitudinal context
 * @param insightsMap - Company insights for strategic context
 * @returns GlobalSummary or null if generation fails
 */
async function generateGlobalSummary(
  companies: CompanyWeeklySummary[],
  totalJobs: number,
  industryTrends: IndustryTrend[],
  previousDigests?: PreviousDigestSummary[],
  insightsMap?: Map<string, CompanyInsightContext>
): Promise<GlobalSummary | null> {
  // Skip if no companies or very few jobs (not enough signal)
  if (companies.length === 0 || totalJobs < 3) {
    console.log("Skipping global summary: insufficient data");
    return null;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn("GEMINI_API_KEY not configured, skipping global summary");
    return null;
  }

  const companySummaries = buildCompanySummariesForGlobalPrompt(companies);
  const topCompanies = companies.slice(0, 5).map(c => c.company_name).join(", ");
  const trendsText = industryTrends.length > 0
    ? industryTrends.map(t => `- ${t.trend}: ${t.explanation}`).join("\n")
    : "No major trends detected";

  const previousContext = formatPreviousDigestsForGlobal(previousDigests ?? []);
  const insightsContext = formatInsightsForGlobal(companies, insightsMap ?? new Map());

  const prompt = GLOBAL_SUMMARY_PROMPT
    .replace("{company_count}", String(companies.length))
    .replace("{total_jobs}", String(totalJobs))
    .replace("{top_companies}", topCompanies)
    .replace("{trends}", trendsText)
    .replace("{company_summaries}", companySummaries)
    .replace("{previous_context}", previousContext)
    .replace("{insights_context}", insightsContext);

  try {
    const genAI = new GoogleGenerativeAI(key);
    
    // Use Gemini 3 Flash Preview as Pro is currently returning empty responses
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 64000, // Increased significantly to prevent cutoff
        // responseMimeType: "application/json", // Removed as it causes issues with preview models
      },
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response.text()?.trim() || "{}";
    
    // Parse the response
    try {
      const cleaned = cleanJsonText(text);
      const parsed = JSON.parse(cleaned);
      if (parsed.headline && parsed.body) {
        console.log("Generated global summary successfully");
        return {
          headline: String(parsed.headline).slice(0, 120),
          body: String(parsed.body).slice(0, 600),
          key_insight: String(parsed.key_insight || parsed.body.substring(0, 200)).slice(0, 200),
        };
      } else {
        console.warn("Global summary missing required fields:", { 
          hasHeadline: !!parsed.headline, 
          hasBody: !!parsed.body,
          keys: Object.keys(parsed)
        });
      }
    } catch (parseError) {
      console.warn("Global summary JSON parse failed, trying regex extraction. Raw response:", text.substring(0, 500));
      // Try regex extraction as fallback
      const headlineMatch = text.match(/"headline":\s*"([^"]+)"/);
      const bodyMatch = text.match(/"body":\s*"([^"]+)"/);
      if (headlineMatch && bodyMatch) {
        console.log("Global summary extracted via regex");
        return {
          headline: headlineMatch[1].slice(0, 120),
          body: bodyMatch[1].slice(0, 600),
          key_insight: bodyMatch[1].slice(0, 200),
        };
      } else {
        console.warn("Global summary regex extraction also failed", {
          headlineMatch: !!headlineMatch,
          bodyMatch: !!bodyMatch
        });
      }
    }
    
    console.warn("Global summary parsing failed, omitting section. Raw response length:", text.length);
    return null;
  } catch (error: unknown) {
    // Handle quota errors
    const err = error as { status?: number; message?: string };
    if (err?.status === 429 || err?.message?.includes("quota") || err?.message?.includes("limit")) {
      console.warn(`Gemini quota exceeded for global summary: ${err.message}`);
    } else {
      console.error("Global summary generation failed:", error);
    }
    return null;
  }
}

// ============================================================================
// Main Report Generator
// ============================================================================

/**
 * Generates a complete weekly digest with AI commentary for all companies
 * 
 * @param weeklyData - Map of company data from getWeeklyData()
 * @param parallelRequests - Number of parallel AI requests (default: 3)
 * @returns Complete weekly digest with all company summaries
 */
/**
 * Calculate normalized week boundaries (Monday 00:00:00 to Sunday 23:59:59)
 * This ensures only one digest per calendar week, regardless of when generation runs.
 */
function getWeekBoundaries(): { weekStart: Date; weekEnd: Date } {
  const now = new Date();
  
  // Get the day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const dayOfWeek = now.getUTCDay();
  
  // Calculate days to subtract to get to the previous Monday
  // If today is Sunday (0), we need to go back 6 days to Monday
  // If today is Monday (1), we need to go back 7 days to previous Monday
  // If today is Tuesday (2), we need to go back 8 days, etc.
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  // Previous Monday (start of last complete week)
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - daysToMonday - 7);
  weekStart.setUTCHours(0, 0, 0, 0);
  
  // Previous Sunday (end of last complete week)
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  
  return { weekStart, weekEnd };
}

export async function generateWeeklyReport(
  weeklyData: Map<string, CompanyJobData>,
  parallelRequests: number = 3
): Promise<WeeklyDigest> {
  // Use normalized week boundaries (Monday-Sunday of previous complete week)
  const { weekStart, weekEnd } = getWeekBoundaries();

  // Fetch longitudinal context and company insights in parallel with trend detection
  const allCompanyIds = Array.from(weeklyData.keys());
  console.log("Fetching longitudinal context and company insights...");
  const [previousDigests, companyInsightsMap, industry_trends] = await Promise.all([
    getPreviousDigests(3),
    getCompanyInsightsContext(allCompanyIds),
    detectIndustryTrends(weeklyData),
  ]);
  console.log(`Longitudinal context: ${previousDigests.length} previous digests, ${companyInsightsMap.size} company insights`);

  const companies: CompanyWeeklySummary[] = [];
  const companyDataArray = Array.from(weeklyData.values());

  // Process companies in batches for parallel AI requests
  for (let i = 0; i < companyDataArray.length; i += parallelRequests) {
    const batch = companyDataArray.slice(i, i + parallelRequests);

    const batchResults = await Promise.all(
      batch.map(async (companyData) => {
        const summary = buildCompanySummaryForAI(companyData);

        // Generate AI commentary with longitudinal and strategic context
        const ai_commentary = await generateCompanyCommentary(
          companyData.company_name,
          summary,
          companyData.jobs.length,
          previousDigests,
          companyInsightsMap.get(companyData.company_id)
        );

        // Build the company weekly summary
        const companySummary: CompanyWeeklySummary = {
          company_id: companyData.company_id,
          company_name: companyData.company_name,
          company_slug: companyData.company_slug,
          new_job_count: companyData.jobs.length,
          departments: summary.departments,
          dominant_tech: summary.dominant_tech.slice(0, 3),
          seniority_breakdown: summary.seniority_breakdown,
          ai_commentary,
          jobs: companyData.jobs.map(job => ({
            id: job.id,
            title: job.title,
            url: job.url,
            salary_min: job.salary_min,
            salary_max: job.salary_max,
            salary_currency: job.salary_currency,
            standardized_department: job.standardized_department,
            seniority_level: job.seniority_level,
            tech_stack: job.tech_stack,
            first_seen_date: job.first_seen_date,
          })),
        };

        return companySummary;
      })
    );

    companies.push(...batchResults);
  }

  // Sort companies by job count (descending)
  companies.sort((a, b) => b.new_job_count - a.new_job_count);

  // Calculate totals
  const totalJobs = companies.reduce((sum, c) => sum + c.new_job_count, 0);

  // Generate strategy signals and notable movements for notable companies.
  // Companies with 5+ jobs are considered "notable" - no artificial cap since we
  // use cached news context (pre-computed during daily collect).
  const notableCompanyIds = companies
    .filter(c => c.new_job_count >= 5)
    .map(c => c.company_id);

  const strategy_signals: StrategySignal[] = [];
  const notable_movements: NotableMovement[] = [];

  if (notableCompanyIds.length > 0) {
    console.log(`Analyzing strategy alignment for ${notableCompanyIds.length} notable companies...`);

    // Batch-read all cached news in one query (fast - no AI calls)
    const cachedNewsMap = await batchGetCachedNews(notableCompanyIds);
    console.log(`Found cached news for ${cachedNewsMap.size}/${notableCompanyIds.length} companies`);

    // Process all companies in parallel - this is fast now since we're using cached data.
    // Strategy alignment is local logic (no AI), and news is pre-fetched.
    const results = await Promise.all(
      notableCompanyIds.map(async (companyId) => {
        try {
          const companyData = weeklyData.get(companyId);
          if (!companyData) return null;

          // Use cached news or empty context (don't do live fetch during digest)
          const newsContext = cachedNewsMap.get(companyId) || emptyNewsContext(companyData.company_name);
          
          // Strategy alignment is local logic, no AI calls
          const alignment = await analyzeStrategyAlignment(companyData, newsContext);
          
          // Extract notable movements from news context
          const movements = (newsContext.leadershipChanges || []).map((change) => ({
            type: "executive" as const,
            company: companyData.company_name,
            description: change.headline,
            sourceUrl: change.sourceUrl,
            sourceTitle: change.sourceTitle,
          }));
          
          return { companyData, alignment, movements };
        } catch (error) {
          const companyData = weeklyData.get(companyId);
          console.error(`Error analyzing ${companyData?.company_name || companyId}:`, error);
          return null;
        }
      })
    );

    for (const r of results) {
      if (!r) continue;
      if (r.alignment.alignment !== "unknown") {
        strategy_signals.push({
          company: r.alignment.companyName,
          alignment: r.alignment.alignment,
          signal: r.alignment.hiringSignal,
          detail: `${r.alignment.statedStrategy} vs ${r.alignment.hiringSignal}`,
          interpretation: r.alignment.interpretation,
        });
      }
      for (const m of r.movements) {
        notable_movements.push(m);
      }
    }
  }

  // Generate global summary (second AI pass to synthesize cross-company trends)
  console.log("Generating global summary...");
  const global_summary = await generateGlobalSummary(
    companies, totalJobs, industry_trends, previousDigests, companyInsightsMap
  );

  const generatedAt = new Date();
  
  return {
    week_start: weekStart.toISOString(),
    week_end: weekEnd.toISOString(),
    generated_at: generatedAt.toISOString(),
    total_jobs: totalJobs,
    total_companies: companies.length,
    companies,
    global_summary,
    industry_trends,
    strategy_signals,
    notable_movements,
  };
}

// ============================================================================
// Convenience Function
// ============================================================================

/**
 * High-level function to generate a complete weekly digest
 * Fetches data and generates AI commentary in one call
 * 
 * @param daysBack - Number of days to look back (default: 7)
 * @returns Complete weekly digest
 */
export async function createWeeklyDigest(daysBack: number = 7): Promise<WeeklyDigest> {
  console.log(`Generating weekly digest for the last ${daysBack} days...`);
  
  // Step 1: Fetch weekly data
  const weeklyData = await getWeeklyData(daysBack);
  console.log(`Found ${weeklyData.size} companies with new job postings`);

  // Step 2: Generate report with AI commentary
  const digest = await generateWeeklyReport(weeklyData);
  console.log(`Generated digest with ${digest.total_jobs} total jobs`);

  return digest;
}
