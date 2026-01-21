/**
 * Company Research Module
 * 
 * Deep research for company strategy, financial reports, and analyst coverage.
 * Features:
 * - Public vs private company detection
 * - Tiered research strategy
 * - Source verification and quality scoring
 * - Graceful degradation
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// ============================================================================
// Types
// ============================================================================

export interface VerifiedSource {
  url: string;
  title: string;
  snippet: string;
  sourceType: "official" | "news" | "sec_filing" | "analyst" | "social" | "funding";
  verificationStatus: "verified" | "unverified" | "paywall";
  retrievedAt: string;
}

export interface CompanyType {
  isPublic: boolean;
  stockSymbol?: string;
  exchange?: string;
  confidence: "high" | "medium" | "low";
}

export interface ResearchResult {
  sources: VerifiedSource[];
  qualityScore: number; // 1-5
  statedStrategy: string | null;
  financialContext: FinancialContext | null;
  limitations: string[];
  searchQueriesUsed: string[];
  estimatedCost: number;
}

export interface FinancialContext {
  recentFunding?: {
    amount?: string;
    round?: string;
    date?: string;
    investors?: string[];
  };
  publicFinancials?: {
    revenue?: string;
    growth?: string;
    employees?: string;
  };
  analystSentiment?: string;
}

export interface DeepResearchOptions {
  isPublic: boolean;
  depth: "basic" | "deep";
  maxSearches?: number;
}

// ============================================================================
// Company Type Detection
// ============================================================================

/**
 * Detect if a company is public or private
 * 
 * @param companyName - The company name to check
 * @param retryCount - Internal retry counter (default: 0)
 * @returns Company type information
 */
export async function detectCompanyType(
  companyName: string,
  retryCount: number = 0
): Promise<CompanyType> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn("GEMINI_API_KEY not configured, assuming private company");
    return { isPublic: false, confidence: "low" };
  }

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 256,
        responseMimeType: "application/json",
      },
    });

    const prompt = `Is "${companyName}" a publicly traded company? If yes, what is its stock symbol and exchange?

Respond with JSON:
{
  "isPublic": true or false,
  "stockSymbol": "SYMBOL" or null,
  "exchange": "NYSE/NASDAQ/TSX/LSE/etc" or null,
  "confidence": "high", "medium", or "low"
}

Only say high confidence if you are certain. Most fintech startups are private.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim() ?? "";

    // Handle empty response
    if (!text || text.length === 0) {
      console.warn(`Empty response from Gemini for company type detection: ${companyName}`);
      
      // Retry logic: attempt up to 2 retries for empty responses
      if (retryCount < 2) {
        console.log(`Retrying company type detection for "${companyName}" due to empty response (attempt ${retryCount + 2}/3)`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return detectCompanyType(companyName, retryCount + 1);
      }
      
      return { isPublic: false, confidence: "low" };
    }

    let parsed: Record<string, unknown> | null = null;

    // Try to parse JSON, with fallback for malformed JSON
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch (parseError) {
      // Log the actual response for debugging (first 200 chars)
      const responsePreview = text.length > 200 ? text.substring(0, 200) + "..." : text;
      console.warn(`JSON parse failed for company type detection "${companyName}". Response preview: ${responsePreview}`);
      
      // Try to extract JSON from text that might have markdown code blocks or extra text
      // First, try to find JSON in markdown code blocks
      const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        try {
          parsed = JSON.parse(codeBlockMatch[1]) as Record<string, unknown>;
          console.log(`Successfully extracted JSON from markdown code block for company type "${companyName}"`);
        } catch {
          // Fall through to next attempt
        }
      }
      
      // If that didn't work, try to find any JSON object in the text
      if (parsed === null) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            // Try to fix common JSON issues: trailing commas before closing braces/brackets
            let jsonText = jsonMatch[0].replace(/,(\s*[}\]])/g, '$1');
            
            parsed = JSON.parse(jsonText) as Record<string, unknown>;
            console.log(`Successfully parsed JSON after fixing trailing commas for company type "${companyName}"`);
          } catch (fixError) {
            console.error(`Failed to parse JSON for company type "${companyName}" after extraction attempts. Error: ${fixError instanceof Error ? fixError.message : String(fixError)}`);
            // Log the problematic JSON snippet for debugging
            if (jsonMatch[0].length < 500) {
              console.error(`Problematic JSON snippet: ${jsonMatch[0]}`);
            }
            
            // Retry logic: attempt up to 2 retries for malformed JSON
            if (retryCount < 2) {
              console.log(`Retrying company type detection for "${companyName}" due to JSON parsing failure (attempt ${retryCount + 2}/3)`);
              await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
              return detectCompanyType(companyName, retryCount + 1);
            }
            
            return { isPublic: false, confidence: "low" };
          }
        } else {
          console.error(`No JSON found in response for company type "${companyName}". Response length: ${text.length}, Preview: ${responsePreview}`);
          // Log full response if it's short enough to be useful
          if (text.length < 500) {
            console.error(`Full response: ${text}`);
          }
          
          // Retry logic: attempt up to 2 retries for empty/malformed responses
          if (retryCount < 2) {
            console.log(`Retrying company type detection for "${companyName}" due to no JSON found (attempt ${retryCount + 2}/3)`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return detectCompanyType(companyName, retryCount + 1);
          }
          
          return { isPublic: false, confidence: "low" };
        }
      }
    }

    // Validate and return parsed data
    if (!parsed) {
      return { isPublic: false, confidence: "low" };
    }

    return {
      isPublic: Boolean(parsed.isPublic),
      stockSymbol: parsed.stockSymbol || undefined,
      exchange: parsed.exchange || undefined,
      confidence: parsed.confidence || "low",
    };
  } catch (error) {
    console.error("Error detecting company type:", error);
    
    // Retry logic for API errors (rate limits, network issues, etc.)
    if (retryCount < 2 && error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      // Retry on rate limit, network, or transient errors
      if (
        errorMessage.includes('rate limit') ||
        errorMessage.includes('network') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('503') ||
        errorMessage.includes('429')
      ) {
        console.log(`Retrying company type detection for "${companyName}" due to ${errorMessage} (attempt ${retryCount + 2}/3)`);
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
        return detectCompanyType(companyName, retryCount + 1);
      }
    }
    
    return { isPublic: false, confidence: "low" };
  }
}

// ============================================================================
// Deep Research
// ============================================================================

/**
 * Perform deep research on a company
 */
export async function performDeepResearch(
  companyName: string,
  options: DeepResearchOptions
): Promise<ResearchResult> {
  const key = process.env.GEMINI_API_KEY;
  const sources: VerifiedSource[] = [];
  const searchQueriesUsed: string[] = [];
  const limitations: string[] = [];
  let estimatedCost = 0;
  const maxSearches = options.maxSearches ?? 10;
  let searchCount = 0;

  if (!key) {
    console.warn("GEMINI_API_KEY not configured, skipping deep research");
    return {
      sources: [],
      qualityScore: 1,
      statedStrategy: null,
      financialContext: null,
      limitations: ["GEMINI_API_KEY not configured"],
      searchQueriesUsed: [],
      estimatedCost: 0,
    };
  }

  const genAI = new GoogleGenerativeAI(key);

  // Helper to perform a search and extract sources
  async function performSearch(query: string, sourceType: VerifiedSource["sourceType"]): Promise<void> {
    if (searchCount >= maxSearches) return;
    searchCount++;
    searchQueriesUsed.push(query);
    estimatedCost += 0.02; // Estimated cost per search

    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
        // @ts-expect-error - googleSearch tool exists at runtime but types may be outdated
        tools: [{ googleSearch: {} }],
      });

      const result = await model.generateContent({
        contents: [{
          role: "user",
          parts: [{ text: `Search for: ${query}\n\nReturn the top 3 most relevant results with their titles, snippets, and URLs. Format as JSON array: [{"title": "...", "snippet": "...", "url": "..."}]` }],
        }],
      });

      const responseText = result.response.text();
      
      // Try to parse JSON from response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as Array<{ title?: string; snippet?: string; url?: string }>;
          for (const item of parsed) {
            if (item.url && item.title) {
              sources.push({
                url: item.url,
                title: item.title,
                snippet: item.snippet || "",
                sourceType,
                verificationStatus: determineVerificationStatus(item.url, sourceType),
                retrievedAt: new Date().toISOString(),
              });
            }
          }
        } catch {
          // Fall back to extracting URLs from text
          const urlRegex = /https?:\/\/[^\s"'<>]+/g;
          const urls = responseText.match(urlRegex) || [];
          for (const url of urls.slice(0, 3)) {
            sources.push({
              url,
              title: `Search result for: ${query}`,
              snippet: responseText.substring(0, 200),
              sourceType,
              verificationStatus: "unverified",
              retrievedAt: new Date().toISOString(),
            });
          }
        }
      }

      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Search error for "${query}":`, error);
    }
  }

  // Tier 1: Always available (basic research)
  await performSearch(`"${companyName}" company strategy mission`, "official");
  await performSearch(`"${companyName}" fintech news announcement 2025 2026`, "news");
  await performSearch(`"${companyName}" press release`, "news");

  if (options.depth === "deep") {
    // More comprehensive basic research
    await performSearch(`"${companyName}" funding round investment`, "funding");
    await performSearch(`"${companyName}" CEO interview strategy`, "news");

    // Tier 2: Public companies only
    if (options.isPublic) {
      await performSearch(`"${companyName}" SEC filing 10-K site:sec.gov`, "sec_filing");
      await performSearch(`"${companyName}" earnings call transcript`, "sec_filing");
      await performSearch(`"${companyName}" investor presentation`, "sec_filing");
    } else {
      limitations.push("Private company - SEC filings and earnings data unavailable");
    }

    // Tier 3: Best effort (may be paywalled)
    await performSearch(`"${companyName}" analyst report research`, "analyst");
  }

  // Calculate quality score
  const qualityScore = calculateResearchQuality(sources, options.isPublic);

  // Extract stated strategy from sources
  const statedStrategy = await extractStatedStrategy(genAI, companyName, sources);
  estimatedCost += 0.03; // Cost for strategy extraction

  // Extract financial context
  const financialContext = await extractFinancialContext(genAI, companyName, sources);
  estimatedCost += 0.02; // Cost for financial extraction

  // Add limitations based on research results
  if (sources.length < 3) {
    limitations.push("Limited public information available");
  }
  if (!sources.some((s) => s.sourceType === "official")) {
    limitations.push("No official company sources found");
  }
  if (options.depth === "deep" && !sources.some((s) => s.sourceType === "analyst")) {
    limitations.push("Analyst reports may be paywalled or unavailable");
  }

  return {
    sources,
    qualityScore,
    statedStrategy,
    financialContext,
    limitations,
    searchQueriesUsed,
    estimatedCost,
  };
}

/**
 * Determine verification status based on URL and source type
 */
function determineVerificationStatus(
  url: string,
  sourceType: VerifiedSource["sourceType"]
): VerifiedSource["verificationStatus"] {
  const urlLower = url.toLowerCase();

  // Official sources
  if (sourceType === "sec_filing" && urlLower.includes("sec.gov")) {
    return "verified";
  }

  // News sources we trust
  const trustedNews = [
    "reuters.com", "bloomberg.com", "wsj.com", "ft.com",
    "techcrunch.com", "finextra.com", "pymnts.com",
    "businesswire.com", "prnewswire.com", "globenewswire.com",
  ];
  if (trustedNews.some((domain) => urlLower.includes(domain))) {
    return "verified";
  }

  // Paywalled sources
  const paywalled = ["bloomberg.com/professional", "refinitiv.com", "pitchbook.com"];
  if (paywalled.some((domain) => urlLower.includes(domain))) {
    return "paywall";
  }

  return "unverified";
}

/**
 * Calculate research quality score (1-5)
 */
function calculateResearchQuality(sources: VerifiedSource[], isPublic: boolean): number {
  const verifiedCount = sources.filter((s) => s.verificationStatus === "verified").length;
  const officialCount = sources.filter((s) => s.sourceType === "official").length;
  const secCount = sources.filter((s) => s.sourceType === "sec_filing").length;
  const totalCount = sources.length;

  // Score criteria
  if (isPublic) {
    // Public company scoring
    if (verifiedCount >= 5 && secCount >= 1) return 5;
    if (verifiedCount >= 3 && (secCount >= 1 || officialCount >= 1)) return 4;
    if (verifiedCount >= 2 || totalCount >= 4) return 3;
    if (totalCount >= 2) return 2;
    return 1;
  } else {
    // Private company scoring (can't get SEC filings)
    if (verifiedCount >= 4 && officialCount >= 1) return 5;
    if (verifiedCount >= 3 || (totalCount >= 4 && officialCount >= 1)) return 4;
    if (verifiedCount >= 2 || totalCount >= 3) return 3;
    if (totalCount >= 2) return 2;
    return 1;
  }
}

/**
 * Extract stated strategy from research sources
 */
async function extractStatedStrategy(
  genAI: GoogleGenerativeAI,
  companyName: string,
  sources: VerifiedSource[]
): Promise<string | null> {
  if (sources.length === 0) return null;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    });

    const sourceText = sources
      .slice(0, 5)
      .map((s) => `Source: ${s.title}\n${s.snippet}`)
      .join("\n\n");

    const prompt = `Based on these research sources about ${companyName}, summarize their publicly stated strategy, mission, and key priorities in 2-3 paragraphs. Focus on:
- Their stated mission and vision
- Key strategic priorities or focus areas
- Recent announcements about direction or growth plans

Sources:
${sourceText}

If there's not enough information to summarize a strategy, say "Insufficient public information to determine stated strategy."`;

    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim();
    
    if (text && !text.toLowerCase().includes("insufficient")) {
      return text;
    }
    return null;
  } catch (error) {
    console.error("Error extracting stated strategy:", error);
    return null;
  }
}

/**
 * Extract financial context from research sources
 */
async function extractFinancialContext(
  genAI: GoogleGenerativeAI,
  companyName: string,
  sources: VerifiedSource[]
): Promise<FinancialContext | null> {
  const fundingSources = sources.filter(
    (s) => s.sourceType === "funding" || s.sourceType === "sec_filing" || s.sourceType === "news"
  );
  
  if (fundingSources.length === 0) return null;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 512,
        responseMimeType: "application/json",
      },
    });

    const sourceText = fundingSources
      .slice(0, 5)
      .map((s) => `Source: ${s.title}\n${s.snippet}`)
      .join("\n\n");

    const prompt = `Extract financial information about ${companyName} from these sources. Return JSON:
{
  "recentFunding": {
    "amount": "e.g. $50M" or null,
    "round": "e.g. Series B" or null,
    "date": "e.g. January 2025" or null,
    "investors": ["investor names"] or null
  },
  "publicFinancials": {
    "revenue": "if mentioned" or null,
    "growth": "growth rate if mentioned" or null,
    "employees": "employee count if mentioned" or null
  },
  "analystSentiment": "positive/negative/neutral summary" or null
}

Only include fields where you found actual data. Sources:
${sourceText}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim() ?? "";

    // Handle empty response
    if (!text || text.length === 0) {
      console.warn(`Empty response from Gemini for financial context extraction: ${companyName}`);
      return null;
    }

    let parsed: Record<string, unknown> | null = null;

    // Try to parse JSON, with fallback for malformed JSON
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch (parseError) {
      // Log the actual response for debugging (first 200 chars)
      const responsePreview = text.length > 200 ? text.substring(0, 200) + "..." : text;
      console.warn(`JSON parse failed for financial context "${companyName}". Response preview: ${responsePreview}`);
      
      // Try to extract JSON from text that might have markdown code blocks or extra text
      // First, try to find JSON in markdown code blocks
      const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        try {
          parsed = JSON.parse(codeBlockMatch[1]) as Record<string, unknown>;
          console.log(`Successfully extracted JSON from markdown code block for financial context "${companyName}"`);
        } catch {
          // Fall through to next attempt
        }
      }
      
      // If that didn't work, try to find any JSON object in the text
      if (parsed === null) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            // Try to fix common JSON issues: trailing commas before closing braces/brackets
            let jsonText = jsonMatch[0].replace(/,(\s*[}\]])/g, '$1');
            
            parsed = JSON.parse(jsonText) as Record<string, unknown>;
            console.log(`Successfully parsed JSON after fixing trailing commas for financial context "${companyName}"`);
          } catch (fixError) {
            console.error(`Failed to parse JSON for financial context "${companyName}" after extraction attempts. Error: ${fixError instanceof Error ? fixError.message : String(fixError)}`);
            // Log the problematic JSON snippet for debugging
            if (jsonMatch[0].length < 500) {
              console.error(`Problematic JSON snippet: ${jsonMatch[0]}`);
            }
            return null;
          }
        } else {
          console.error(`No JSON found in response for financial context "${companyName}". Response length: ${text.length}, Preview: ${responsePreview}`);
          // Log full response if it's short enough to be useful
          if (text.length < 500) {
            console.error(`Full response: ${text}`);
          }
          return null;
        }
      }
    }

    // Only return if we found something meaningful
    if (parsed && (parsed.recentFunding || parsed.publicFinancials || parsed.analystSentiment)) {
      const recentFunding = parsed.recentFunding as Record<string, unknown> | undefined;
      const publicFinancials = parsed.publicFinancials as Record<string, unknown> | undefined;
      
      if (recentFunding?.amount || publicFinancials?.revenue || parsed.analystSentiment) {
        return parsed as FinancialContext;
      }
    }
    return null;
  } catch (error) {
    console.error("Error extracting financial context:", error);
    return null;
  }
}

/**
 * Format research for LLM prompt
 */
export function formatResearchForPrompt(research: ResearchResult): string {
  let text = `## External Research & Company Context\n\n`;

  if (research.statedStrategy) {
    text += `### Publicly Stated Strategy:\n${research.statedStrategy}\n\n`;
  }

  if (research.financialContext) {
    text += `### Financial Context:\n`;
    if (research.financialContext.recentFunding?.amount) {
      text += `- Recent Funding: ${research.financialContext.recentFunding.amount}`;
      if (research.financialContext.recentFunding.round) {
        text += ` (${research.financialContext.recentFunding.round})`;
      }
      if (research.financialContext.recentFunding.date) {
        text += ` - ${research.financialContext.recentFunding.date}`;
      }
      text += `\n`;
    }
    if (research.financialContext.publicFinancials?.employees) {
      text += `- Employees: ${research.financialContext.publicFinancials.employees}\n`;
    }
    if (research.financialContext.analystSentiment) {
      text += `- Analyst Sentiment: ${research.financialContext.analystSentiment}\n`;
    }
    text += `\n`;
  }

  if (research.sources.length > 0) {
    text += `### Research Sources (${research.sources.length} found, quality score: ${research.qualityScore}/5):\n`;
    const verifiedSources = research.sources.filter((s) => s.verificationStatus === "verified");
    for (const source of verifiedSources.slice(0, 5)) {
      text += `- [${source.sourceType}] ${source.title}\n`;
    }
    text += `\n`;
  }

  if (research.limitations.length > 0) {
    text += `### Research Limitations:\n`;
    for (const limit of research.limitations) {
      text += `- ${limit}\n`;
    }
    text += `\n`;
  }

  return text;
}
