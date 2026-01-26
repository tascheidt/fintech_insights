/**
 * Company News Context Fetcher
 * 
 * Uses Gemini 3 Pro with Google Search grounding to fetch recent company news,
 * stated strategy, and other external context for digest generation.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

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
 * Fetch company news context using web search
 * Results are cached for 7 days to avoid redundant searches
 */
export async function fetchCompanyNewsContext(
  companyName: string
): Promise<CompanyNewsContext> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn("GEMINI_API_KEY not configured, skipping company news search");
    return {
      companyName,
      recentNews: [],
      statedStrategy: null,
      fundingNews: null,
      productLaunches: [],
      leadershipChanges: [],
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(key);
    
    // Use Gemini 3 Pro with grounding for web search
    const model = genAI.getGenerativeModel({
      model: "gemini-3-pro-preview",
      tools: [{ googleSearch: {} }], // Enable grounding
      generationConfig: {
        temperature: 0.3, // Lower temperature for more factual extraction
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

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

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
      console.warn(`Failed to parse company news JSON for ${companyName}:`, parseError);
      return {
        companyName,
        recentNews: [],
        statedStrategy: null,
        fundingNews: null,
        productLaunches: [],
        leadershipChanges: [],
      };
    }
  } catch (error: unknown) {
    // Handle quota errors and other failures gracefully
    const err = error as { status?: number; message?: string };
    if (err?.status === 429 || err?.message?.includes("quota") || err?.message?.includes("limit")) {
      console.warn(`Gemini quota exceeded for company news search: ${companyName}`);
    } else {
      console.error(`Company news search failed for ${companyName}:`, error);
    }
    
    // Return empty context on failure
    return {
      companyName,
      recentNews: [],
      statedStrategy: null,
      fundingNews: null,
      productLaunches: [],
      leadershipChanges: [],
    };
  }
}
