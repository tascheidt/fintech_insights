/**
 * Company News Context Fetcher
 * 
 * Uses Gemini Pro with Google Search grounding to fetch recent company news,
 * stated strategy, and other external context for digest generation.
 * 
 * Results are cached in the database for 7 days to avoid expensive real-time
 * lookups during weekly digest generation.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { recordUsage } from "@/lib/ai/gemini-meter";
import { writeUsageEvent } from "@/lib/ai/gemini-telemetry";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

export interface NewsItem {
  headline: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

export interface CompanyNewsContext {
  companyName: string;
  recentNews: NewsItem[];           // Key news headlines/summaries with sources
  statedStrategy: string | null;    // What company says they're doing
  fundingNews: string | null;       // Recent funding/financial news
  productLaunches: string[];        // New product announcements
  leadershipChanges: NewsItem[];    // Executive/leadership changes with sources
}

/**
 * Database row type for company_news_cache table
 */
interface CompanyNewsCacheRow {
  id: string;
  company_id: string;
  company_name: string;
  recent_news: NewsItem[];
  stated_strategy: string | null;
  funding_news: string | null;
  product_launches: string[];
  leadership_changes: NewsItem[];
  fetched_at: string;
  expires_at: string;
}

/**
 * Returns an empty news context for a company (used as fallback)
 */
export function emptyNewsContext(companyName: string): CompanyNewsContext {
  return {
    companyName,
    recentNews: [],
    statedStrategy: null,
    fundingNews: null,
    productLaunches: [],
    leadershipChanges: [],
  };
}

// ============================================================================
// Cache Functions
// ============================================================================

/**
 * Get cached news for a single company
 */
export async function getCachedNews(companyId: string): Promise<CompanyNewsContext | null> {
  const supabase = createAdminClient();
  
  const { data, error } = await supabase
    .from("company_news_cache")
    .select("*")
    .eq("company_id", companyId)
    .gt("expires_at", new Date().toISOString())
    .single();
  
  if (error || !data) {
    return null;
  }
  
  const row = data as CompanyNewsCacheRow;
  return {
    companyName: row.company_name,
    recentNews: row.recent_news || [],
    statedStrategy: row.stated_strategy,
    fundingNews: row.funding_news,
    productLaunches: row.product_launches || [],
    leadershipChanges: row.leadership_changes || [],
  };
}

/**
 * Get cached news for multiple companies in one query
 */
export async function batchGetCachedNews(
  companyIds: string[]
): Promise<Map<string, CompanyNewsContext>> {
  if (companyIds.length === 0) {
    return new Map();
  }
  
  const supabase = createAdminClient();
  
  const { data, error } = await supabase
    .from("company_news_cache")
    .select("*")
    .in("company_id", companyIds)
    .gt("expires_at", new Date().toISOString());
  
  const result = new Map<string, CompanyNewsContext>();
  
  if (error || !data) {
    return result;
  }
  
  for (const row of data as CompanyNewsCacheRow[]) {
    result.set(row.company_id, {
      companyName: row.company_name,
      recentNews: row.recent_news || [],
      statedStrategy: row.stated_strategy,
      fundingNews: row.funding_news,
      productLaunches: row.product_launches || [],
      leadershipChanges: row.leadership_changes || [],
    });
  }
  
  return result;
}

/**
 * Save news context to cache (upsert)
 */
export async function saveToNewsCache(
  companyId: string,
  companyName: string,
  context: CompanyNewsContext
): Promise<void> {
  const supabase = createAdminClient();
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 day TTL
  
  const { error } = await supabase
    .from("company_news_cache")
    .upsert({
      company_id: companyId,
      company_name: companyName,
      recent_news: context.recentNews,
      stated_strategy: context.statedStrategy,
      funding_news: context.fundingNews,
      product_launches: context.productLaunches,
      leadership_changes: context.leadershipChanges,
      fetched_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    }, {
      onConflict: "company_id",
    });
  
  if (error) {
    log.error({ err: error }, `Failed to cache news for ${companyName}:`);
  }
}

// ============================================================================
// Main Fetch Function
// ============================================================================

export interface FetchNewsOptions {
  forceRefresh?: boolean;
}

/**
 * Fetch company news context with caching support.
 * 
 * If companyId is provided, checks cache first and returns cached data if valid.
 * Otherwise fetches fresh data from Gemini Pro (latest) + Google Search.
 * 
 * @param companyName - The company name to search for
 * @param companyId - Optional company UUID for cache lookup/storage
 * @param options - Options like forceRefresh to bypass cache
 */
export async function fetchCompanyNewsContext(
  companyName: string,
  companyId?: string,
  options?: FetchNewsOptions
): Promise<CompanyNewsContext> {
  // 1. Check cache if companyId provided and not forcing refresh
  if (companyId && !options?.forceRefresh) {
    const cached = await getCachedNews(companyId);
    if (cached) {
      log.info(`Using cached news for ${companyName}`);
      return cached;
    }
  }
  
  // 2. Fetch fresh from Gemini
  const context = await fetchFreshNewsContext(companyName);
  
  // 3. Save to cache if companyId provided
  if (companyId) {
    await saveToNewsCache(companyId, companyName, context);
  }
  
  return context;
}

/**
 * Fetch fresh news context from Gemini Pro with Google Search grounding.
 * This is the expensive operation (~45-90s) that we want to cache.
 */
async function fetchFreshNewsContext(companyName: string): Promise<CompanyNewsContext> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    log.warn("GEMINI_API_KEY not configured, skipping company news search");
    return emptyNewsContext(companyName);
  }

  try {
    const genAI = new GoogleGenerativeAI(key);
    
    // Use Gemini Flash with grounding for web search (Flash supports Google Search
    // and is significantly cheaper than Pro — company-research.ts already uses this pattern)
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      // @ts-expect-error - googleSearch tool exists at runtime but types may be outdated
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4000,
        responseMimeType: "application/json",
      },
    });
    
    const prompt = `
Research "${companyName}" fintech company. Find information from the last 30 days:

1. Their publicly stated strategy and priorities
2. Recent news: funding rounds, partnerships, major announcements
3. Leadership changes or executive announcements
4. New product launches or feature announcements
5. Any strategic pivots or new market entries

IMPORTANT: Include source URLs when available so users can read the original articles.

Output JSON with this exact structure:
{
  "stated_strategy": "Brief summary of their publicly stated strategy, or null if not found",
  "recent_news": [
    { "headline": "News headline 1", "sourceUrl": "https://...", "sourceTitle": "Publication Name" },
    { "headline": "News headline 2", "sourceUrl": "https://...", "sourceTitle": "Publication Name" }
  ],
  "leadership_changes": [
    { "headline": "Executive change description", "sourceUrl": "https://...", "sourceTitle": "Publication Name" }
  ],
  "funding_news": "Recent funding information, or null",
  "product_launches": ["Product 1", "Product 2", ...]
}

Be concise but specific. Always include sourceUrl when you can cite a specific article.
If information is not available, use null or empty arrays.
`;

    const _startMs = Date.now();
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    writeUsageEvent(
      recordUsage({
        callSite: "fetchCompanyNews",
        modelRequested: "gemini-flash-latest",
        groundingEnabled: true,
        usageMetadata: result.response.usageMetadata,
        latencyMs: Date.now() - _startMs,
        status: "ok",
        extra: { companyName },
      })
    );

    const text = result.response.text()?.trim() || "{}";
    
    try {
      // Clean JSON text
      let cleaned = text.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      
      const parsed = JSON.parse(cleaned);
      
      // Parse news items (handle both old string[] and new NewsItem[] format)
      const parseNewsItems = (items: unknown[]): NewsItem[] => {
        if (!Array.isArray(items)) return [];
        return items.map((item: unknown) => {
          if (typeof item === "string") {
            return { headline: item };
          }
          const obj = item as { headline?: string; sourceUrl?: string; sourceTitle?: string };
          return {
            headline: obj.headline || String(item),
            sourceUrl: obj.sourceUrl,
            sourceTitle: obj.sourceTitle,
          };
        });
      };
      
      return {
        companyName,
        recentNews: parseNewsItems(parsed.recent_news || []),
        statedStrategy: parsed.stated_strategy || null,
        fundingNews: parsed.funding_news || null,
        productLaunches: Array.isArray(parsed.product_launches) ? parsed.product_launches : [],
        leadershipChanges: parseNewsItems(parsed.leadership_changes || []),
      };
    } catch (parseError) {
      log.warn({ err: parseError }, `Failed to parse company news JSON for ${companyName}:`);
      return emptyNewsContext(companyName);
    }
  } catch (error: unknown) {
    // Handle quota errors and other failures gracefully
    const err = error as { status?: number; message?: string };
    if (err?.status === 429 || err?.message?.includes("quota") || err?.message?.includes("limit")) {
      log.warn(`Gemini quota exceeded for company news search: ${companyName}`);
    } else {
      log.error({ err: error }, `Company news search failed for ${companyName}:`);
    }
    
    // Return empty context on failure
    return emptyNewsContext(companyName);
  }
}
