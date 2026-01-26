/**
 * Weekly Digest Generator with AI Analysis
 * 
 * Generates weekly reports combining raw job data with AI-generated strategic commentary.
 * Uses Gemini 3 Pro for strategic analysis of each company's hiring patterns.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchCompanyNewsContext } from "./company-news";
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
  
  // Seniority trends
  const totalJobs = allJobs.length;
  const seniorJobs = (seniorityCounts["senior"] || 0) + (seniorityCounts["lead"] || 0) + (seniorityCounts["principal"] || 0);
  const seniorPercentage = totalJobs > 0 ? (seniorJobs / totalJobs) * 100 : 0;
  
  if (seniorPercentage > 50) {
    trends.push({
      trend: "Senior-heavy hiring",
      explanation: `${Math.round(seniorPercentage)}% of new roles are senior-level`,
      companies: Array.from(weeklyData.values()).map(c => c.company_name),
      jobCount: seniorJobs,
      direction: "up",
    });
  }
  
  return trends.slice(0, 5); // Return top 5 trends
}

// ============================================================================
// AI Analyst Function - TLDR Style
// ============================================================================

const TLDR_PROMPT = `You are the witty, insightful Editor of "Fintech Insights TLDR". Your style is punchy, conversational, and smart (modeled after Wealthsimple's TLDR newsletter). Avoid corporate jargon. Use emojis effectively.

## Company: {company_name}

## This Week's Hiring Summary:
- Total New Postings: {job_count}
- Departments: {departments}
- Seniority Levels: {seniority_breakdown}
- Top Technologies: {tech_stack}
- Job Titles: {job_titles}

## Your Task:
Write a TLDR-style update that reveals the STRATEGIC MOVE behind these hires.

**CRITICAL - Headlines That Are FAILURES (never do these):**
❌ "[Company] is hiring" - BORING, says nothing
❌ "[Company] posted jobs" - OBVIOUS, waste of space  
❌ "[Company] has openings" - GENERIC, no insight
❌ "[Company] expands team" - VAGUE, could be anyone
❌ "📊 EQ Bank is hiring" - THIS IS A FAILURE

**Headlines That Win:**
✅ "🚀 Wealthsimple hits the gas" - implies acceleration/growth
✅ "🔧 Stripe rebuilds the engine" - implies infrastructure overhaul
✅ "🎯 EQ Bank doubles down on lending" - specific strategic focus
✅ "🤖 Koho bets big on AI" - clear tech direction
✅ "🏗️ Neo builds the platform team" - what they're building
✅ "💼 CIBC raids the Street" - talent acquisition narrative

**Pattern Detection - Use the data to infer the story:**
- Senior-heavy (>50% senior/lead roles) → "building the A-team" or "scaling expertise"
- Single department dominance (>60% one area) → "laser-focused on [X]" or "doubling down on [X]"
- AI/ML tech stack → "betting on AI" or "going autonomous"
- Engineering + Product mix → "shipping mode" or "building something big"
- Compliance/Risk heavy → "battening down the hatches" or "playing defense"
- Multiple locations → "going global" or "expanding reach"
- Entry-level heavy → "building the bench" or "scaling ops"

**Output JSON:**
{
  "headline": "A 3-5 word headline with ONE emoji that reveals the STRATEGIC MOVE, not just the fact of hiring",
  "body": "2-3 punchy sentences. What are they building? Why now? What does the tech/seniority mix tell us about their strategy?"
}

**Self-check before responding:**
1. Does my headline reveal WHAT they're doing, not just THAT they're hiring?
2. Would this headline make a fintech insider say "interesting..."?
3. Could this headline apply to literally any company? If yes, make it more specific.

Respond with ONLY valid JSON, no markdown.`;

/**
 * Default TLDR commentary when AI is unavailable
 * Uses job count to create a semi-interesting fallback
 */
function getDefaultTLDR(companyName: string, jobCount: number): TLDRCommentary {
  // Create tiered fallback headlines based on volume
  if (jobCount >= 50) {
    return {
      headline: `🚀 ${companyName} goes big`,
      body: `${companyName} dropped ${jobCount} new roles this week. That's not a hiring push—that's a hiring blitz. Something big is brewing.`,
    };
  } else if (jobCount >= 20) {
    return {
      headline: `📈 ${companyName} scales up`,
      body: `${companyName} posted ${jobCount} new roles this week. That's serious expansion mode. Check the breakdown to see where they're investing.`,
    };
  } else if (jobCount >= 10) {
    return {
      headline: `🏗️ ${companyName} builds momentum`,
      body: `${companyName} added ${jobCount} new positions this week. Steady growth across the team.`,
    };
  } else {
    return {
      headline: `📊 ${companyName} adds talent`,
      body: `${companyName} posted ${jobCount} new role${jobCount === 1 ? "" : "s"} this week. Targeted hiring for key positions.`,
    };
  }
}

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
 */
function parseTLDRResponse(text: string, companyName: string, jobCount: number): TLDRCommentary {
  try {
    // Clean and parse JSON
    const cleaned = cleanJsonText(text);
    const parsed = JSON.parse(cleaned);
    
    if (parsed.headline && parsed.body) {
      return {
        headline: String(parsed.headline).slice(0, 100),
        body: String(parsed.body).slice(0, 500),
      };
    }
  } catch {
    // If JSON parsing fails, try to extract from text
    const headlineMatch = text.match(/"headline":\s*"([^"]+)"/);
    const bodyMatch = text.match(/"body":\s*"([^"]+)"/);
    
    if (headlineMatch && bodyMatch) {
      return {
        headline: headlineMatch[1].slice(0, 100),
        body: bodyMatch[1].slice(0, 500),
      };
    }
  }
  
  // Fallback to default
  return getDefaultTLDR(companyName, jobCount);
}

/**
 * Generate TLDR-style AI commentary for a single company's weekly hiring data
 */
async function generateCompanyCommentary(
  companyName: string,
  summary: {
    departments: Record<string, number>;
    seniority_breakdown: Record<string, number>;
    dominant_tech: string[];
    job_titles: string[];
  },
  jobCount: number
): Promise<TLDRCommentary> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn("GEMINI_API_KEY not configured, skipping AI commentary");
    return getDefaultTLDR(companyName, jobCount);
  }

  const prompt = TLDR_PROMPT
    .replace("{company_name}", companyName)
    .replace("{job_count}", String(jobCount))
    .replace("{departments}", JSON.stringify(summary.departments))
    .replace("{seniority_breakdown}", JSON.stringify(summary.seniority_breakdown))
    .replace("{tech_stack}", summary.dominant_tech.join(", ") || "Not specified")
    .replace("{job_titles}", summary.job_titles.slice(0, 10).join(", "));

  try {
    const genAI = new GoogleGenerativeAI(key);
    
    // Use Gemini 3 Flash Preview as Pro is currently returning empty responses
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        temperature: 0.7, // Slightly higher for more creative output
        maxOutputTokens: 64000, // Increased to prevent cutoff
        // responseMimeType: "application/json", // Removed as it causes issues with preview models
      },
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response.text()?.trim() || "{}";
    return parseTLDRResponse(text, companyName, jobCount);
  } catch (error: unknown) {
    // Handle quota errors gracefully
    const err = error as { status?: number; message?: string };
    if (err?.status === 429 || err?.message?.includes("quota") || err?.message?.includes("limit")) {
      console.warn(`Gemini quota exceeded: ${err.message}`);
      return getDefaultTLDR(companyName, jobCount);
    }
    
    console.error(`AI commentary error for ${companyName}:`, error);
    return getDefaultTLDR(companyName, jobCount);
  }
}

// ============================================================================
// Global Summary - Cross-Company Trend Analysis
// ============================================================================

/**
 * Prompt for generating a global summary that synthesizes trends across all companies.
 * This is the "TL;DR of TL;DRs" - a high-level view of what's happening in the market.
 */
const GLOBAL_SUMMARY_PROMPT = `You are an elite fintech analyst creating a weekly intelligence brief.

## This Week's Hiring Data:
- Total new jobs: {total_jobs} across {company_count} companies
- Top companies: {top_companies}
- Detected trends: {trends}

## Company Summaries:
{company_summaries}

## Your Task:
Create an industry-level intelligence brief that answers:
1. What's the overall theme of fintech hiring this week?
2. What's the single most important insight readers should know?

**Output a JSON object with exactly these fields:**
{
  "headline": "Industry-wide headline (5-8 words with emoji)",
  "key_insight": "The single most important thing to know (one sentence)",
  "body": "2-3 sentences synthesizing the key trend(s). Be specific about what you're seeing."
}

**Guidelines:**
- Focus on cross-company patterns, not individual company news
- Be specific about the trend you're identifying
- Make it valuable for someone who only has 10 seconds
- If there's no clear theme, note the diversity instead

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
 * @returns GlobalSummary or null if generation fails
 */
async function generateGlobalSummary(
  companies: CompanyWeeklySummary[],
  totalJobs: number,
  industryTrends: IndustryTrend[]
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
  
  const prompt = GLOBAL_SUMMARY_PROMPT
    .replace("{company_count}", String(companies.length))
    .replace("{total_jobs}", String(totalJobs))
    .replace("{top_companies}", topCompanies)
    .replace("{trends}", trendsText)
    .replace("{company_summaries}", companySummaries);

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

  const companies: CompanyWeeklySummary[] = [];
  const companyDataArray = Array.from(weeklyData.values());

  // Process companies in batches for parallel AI requests
  for (let i = 0; i < companyDataArray.length; i += parallelRequests) {
    const batch = companyDataArray.slice(i, i + parallelRequests);
    
    const batchResults = await Promise.all(
      batch.map(async (companyData) => {
        const summary = buildCompanySummaryForAI(companyData);
        
        // Generate AI commentary
        const ai_commentary = await generateCompanyCommentary(
          companyData.company_name,
          summary,
          companyData.jobs.length
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

  // Detect industry trends
  console.log("Detecting industry trends...");
  const industry_trends = await detectIndustryTrends(weeklyData);

  // Generate strategy signals and notable movements for notable companies
  // Only process companies with significant activity (5+ jobs) to manage API costs
  // Use original weeklyData to get CompanyJobData before it was transformed
  const notableCompanyIds = companies
    .filter(c => c.new_job_count >= 5)
    .slice(0, 10) // Limit to top 10
    .map(c => c.company_id);
  
  const strategy_signals: StrategySignal[] = [];
  const notable_movements: NotableMovement[] = [];

  if (notableCompanyIds.length > 0) {
    console.log(`Analyzing strategy alignment for ${notableCompanyIds.length} notable companies...`);
    
    // Process companies sequentially to avoid rate limits
    for (const companyId of notableCompanyIds) {
      try {
        const companyData = weeklyData.get(companyId);
        if (!companyData) continue;

        // Fetch company news context
        const newsContext = await fetchCompanyNewsContext(companyData.company_name);
        
        // Analyze strategy alignment
        const alignment = await analyzeStrategyAlignment(companyData, newsContext);
        
        if (alignment.alignment !== "unknown") {
          strategy_signals.push({
            company: alignment.companyName,
            alignment: alignment.alignment,
            signal: alignment.hiringSignal,
            detail: `${alignment.statedStrategy} vs ${alignment.hiringSignal}`,
            interpretation: alignment.interpretation,
          });
        }

        // Extract notable movements from news context (with source links)
        if (newsContext.leadershipChanges.length > 0) {
          for (const change of newsContext.leadershipChanges) {
            notable_movements.push({
              type: "executive",
              company: companyData.company_name,
              description: change.headline,
              sourceUrl: change.sourceUrl,
              sourceTitle: change.sourceTitle,
            });
          }
        }

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        const companyData = weeklyData.get(companyId);
        console.error(`Error analyzing ${companyData?.company_name || companyId}:`, error);
        // Continue with other companies even if one fails
      }
    }
  }

  // Generate global summary (second AI pass to synthesize cross-company trends)
  console.log("Generating global summary...");
  const global_summary = await generateGlobalSummary(companies, totalJobs, industry_trends);

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
