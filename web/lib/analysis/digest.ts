/**
 * Weekly Digest Generator with AI Analysis
 * 
 * Generates weekly reports combining raw job data with AI-generated strategic commentary.
 * Uses Gemini 3 Pro for strategic analysis of each company's hiring patterns.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createAdminClient } from "@/lib/supabase/admin";

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
 * Weekly digest containing all company summaries
 */
export interface WeeklyDigest {
  week_start: string;
  week_end: string;
  generated_at: string;
  total_jobs: number;
  total_companies: number;
  companies: CompanyWeeklySummary[];
}

/**
 * Intermediate structure for organizing data by company
 */
interface CompanyJobData {
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
        slug
      )
    `)
    .gte("first_seen_date", cutoffIso)
    .eq("is_active", true)
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
// AI Analyst Function - TLDR Style
// ============================================================================

const TLDR_PROMPT = `You are the witty, insightful Editor of "Fintech Insights TLDR". Your style is punchy, conversational, and smart (modeled after Wealthsimple's TLDR newsletter). Avoid corporate jargon like "leveraging synergies" or "paradigm shift". Use emojis sparingly but effectively.

## Company: {company_name}

## This Week's Hiring Summary:
- Total New Postings: {job_count}
- Departments: {departments}
- Seniority Levels: {seniority_breakdown}
- Top Technologies: {tech_stack}
- Job Titles: {job_titles}

## Your Task:
Write a TLDR-style update about this company's hiring moves.

**Output a JSON object with exactly these fields:**
{
  "headline": "A short, catchy 3-5 word headline with ONE relevant emoji at the start (e.g., '🚗 Wealthsimple hits the gas' or '🔧 Stripe rebuilds the engine')",
  "body": "2-3 punchy sentences explaining the strategic move. Focus on the *strategy* implied by the tech/seniority mix. Be specific about what they're building or scaling. Example: 'They just dropped 5 Senior Backend roles. Looks like they're rebuilding the ledger, not just painting the frontend.'"
}

**Guidelines:**
- Be conversational and smart, not formal
- Focus on the "why" behind the hires
- Make it interesting for a fintech insider to read
- Avoid buzzwords and corporate-speak
- The headline emoji should match the theme (🚀 for growth, 🔧 for infrastructure, 🎯 for focus, 💰 for funding-related, 🤖 for AI/ML, etc.)

Respond with ONLY valid JSON, no markdown formatting.`;

/**
 * Default TLDR commentary when AI is unavailable
 */
function getDefaultTLDR(companyName: string, jobCount: number): TLDRCommentary {
  return {
    headline: `📊 ${companyName} is hiring`,
    body: `${companyName} posted ${jobCount} new role${jobCount === 1 ? "" : "s"} this week. Check the details below for the full breakdown.`,
  };
}

/**
 * Parse AI response into TLDRCommentary
 */
function parseTLDRResponse(text: string, companyName: string, jobCount: number): TLDRCommentary {
  try {
    // Try to parse as JSON directly
    const parsed = JSON.parse(text);
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
    
    // Use Gemini 3 Pro for strategic analysis with JSON mode
    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-preview",
      generationConfig: {
        temperature: 0.7, // Slightly higher for more creative output
        maxOutputTokens: 512,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response.text()?.trim() || "{}";
    return parseTLDRResponse(text, companyName, jobCount);
  } catch (error: unknown) {
    // Handle quota errors gracefully - fallback to flash model
    const err = error as { status?: number; message?: string };
    if (err?.status === 429 || err?.message?.includes("quota") || err?.message?.includes("limit")) {
      console.warn(`Gemini Pro quota exceeded, falling back to Flash: ${err.message}`);
      try {
        const genAI = new GoogleGenerativeAI(key);
        const flashModel = genAI.getGenerativeModel({
          model: "gemini-3-flash-preview",
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 512,
            responseMimeType: "application/json",
          },
        });

        const result = await flashModel.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        const text = result.response.text()?.trim() || "{}";
        return parseTLDRResponse(text, companyName, jobCount);
      } catch (flashError) {
        console.error("Flash model also failed:", flashError);
        return getDefaultTLDR(companyName, jobCount);
      }
    }
    
    console.error(`AI commentary error for ${companyName}:`, error);
    return getDefaultTLDR(companyName, jobCount);
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
export async function generateWeeklyReport(
  weeklyData: Map<string, CompanyJobData>,
  parallelRequests: number = 3
): Promise<WeeklyDigest> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

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

  return {
    week_start: weekStart.toISOString(),
    week_end: now.toISOString(),
    generated_at: now.toISOString(),
    total_jobs: totalJobs,
    total_companies: companies.length,
    companies,
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
