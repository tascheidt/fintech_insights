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
import { scoreRankedSource } from "./source-scoring";

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

const FINTECH_RELEVANCE_TERMS = [
  "bank",
  "banking",
  "financial",
  "fintech",
  "wealth",
  "payments",
  "payment",
  "credit",
  "debit",
  "lending",
  "loan",
  "deposit",
  "card",
  "invest",
  "investment",
  "customer",
  "client",
  "mobile app",
  "digital bank",
  "money",
  "portfolio",
  "onboarding",
];

const IRRELEVANT_SOURCE_PATTERNS = [
  "essential oil",
  "citrus",
  "retailer",
  "retailers",
  "shibuya",
  "lagos",
  "japan",
  "market size",
  "industry market",
  "extraction techniques",
  "oil market",
];

const LOW_SIGNAL_SOURCE_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "wikipedia.org",
];

const LOW_SIGNAL_TITLE_PATTERNS = [
  "reports, statistics & marketing trends",
  "market trends",
  "market industry analysis",
  "industry analysis",
];

const COMPANY_DISAMBIGUATION_RULES: Record<
  string,
  {
    requiredAny: string[];
    blockedAny: string[];
  }
> = {
  tangerine: {
    requiredAny: [
      "bank",
      "banking",
      "canada",
      "canadian",
      "scotiabank",
      "forward banking",
      "engine by starling",
      "terri-lee weeks",
      "gillian riley",
      "scene+",
    ],
    blockedAny: [
      "nigeria",
      "mumbai",
      "africa",
      "insurance",
      "pensions",
      "startuplist",
      "seed funding round",
      "private equity-backed financial services group",
    ],
  },
};

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
      model: "gemini-flash-latest",
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

    // Type-safe extraction with proper type guards
    const stockSymbol = typeof parsed.stockSymbol === "string" && parsed.stockSymbol.trim() 
      ? parsed.stockSymbol.trim() 
      : undefined;
    const exchange = typeof parsed.exchange === "string" && parsed.exchange.trim()
      ? parsed.exchange.trim()
      : undefined;
    const confidence = typeof parsed.confidence === "string" && 
      ["high", "medium", "low"].includes(parsed.confidence)
      ? parsed.confidence as "high" | "medium" | "low"
      : "low";

    return {
      isPublic: Boolean(parsed.isPublic),
      stockSymbol,
      exchange,
      confidence,
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

  function getFallbackQueries(query: string, sourceType: VerifiedSource["sourceType"]) {
    const normalizedCompany = companyName.replace(/"/g, "");

    if (query.includes("press release")) {
      return [
        `"${normalizedCompany}" announcement partnership launch Canada`,
        `"${normalizedCompany}" product launch digital banking 2025 2026`,
      ];
    }

    if (sourceType === "official") {
      return [
        `"${normalizedCompany}" about mission leadership banking`,
      ];
    }

    if (sourceType === "funding") {
      return [
        `"${normalizedCompany}" valuation funding investors fintech`,
      ];
    }

    if (sourceType === "analyst") {
      return [
        `"${normalizedCompany}" digital banking competitive analysis`,
      ];
    }

    if (sourceType === "news") {
      return [
        `"${normalizedCompany}" fintech bank wealth payments strategy`,
      ];
    }

    return [];
  }

  // Helper to perform a search and extract sources
  async function performSearch(
    query: string,
    sourceType: VerifiedSource["sourceType"],
    allowFallback: boolean = true
  ): Promise<void> {
    if (searchCount >= maxSearches) return;
    searchCount++;
    searchQueriesUsed.push(query);
    estimatedCost += 0.02; // Estimated cost per search

    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-flash-latest",
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
              const source: VerifiedSource = {
                url: item.url,
                title: item.title,
                snippet: item.snippet || "",
                sourceType,
                verificationStatus: determineVerificationStatus(item.url, sourceType),
                retrievedAt: new Date().toISOString(),
              };
              if (isLikelyRelevantSource(companyName, source)) {
                sources.push(source);
              }
            }
          }
        } catch {
          // Fall back to extracting URLs from text
          const urlRegex = /https?:\/\/[^\s"'<>]+/g;
          const urls = responseText.match(urlRegex) || [];
          for (const url of urls.slice(0, 3)) {
            const source: VerifiedSource = {
              url,
              title: `Search result for: ${query}`,
              snippet: responseText.substring(0, 200),
              sourceType,
              verificationStatus: "unverified",
              retrievedAt: new Date().toISOString(),
            };
            if (isLikelyRelevantSource(companyName, source)) {
              sources.push(source);
            }
          }
        }
      }

      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const shouldRetryWithFallback =
        allowFallback &&
        (errorMessage.includes("recitation") || errorMessage.includes("blocked"));

      if (shouldRetryWithFallback) {
        console.warn(`Search blocked for "${query}", retrying with fallback queries.`);
        for (const fallbackQuery of getFallbackQueries(query, sourceType)) {
          await performSearch(fallbackQuery, sourceType, false);
          if (searchCount >= maxSearches) {
            break;
          }
        }
        return;
      }

      console.error(`Search error for "${query}":`, error);
    }
  }

  // Tier 1: Always available (basic research)
  await performSearch(`"${companyName}" financial services company strategy mission`, "official");
  await performSearch(`"${companyName}" fintech bank wealth payments news announcement 2025 2026`, "news");
  await performSearch(`"${companyName}" press release`, "news");

  if (options.depth === "deep") {
    // More comprehensive basic research
    await performSearch(`"${companyName}" fintech funding round investment`, "funding");
    await performSearch(`"${companyName}" CEO interview digital banking strategy`, "news");

    // Tier 2: Public companies only
    if (options.isPublic) {
      await performSearch(`"${companyName}" SEC filing 10-K site:sec.gov`, "sec_filing");
      await performSearch(`"${companyName}" earnings call transcript`, "sec_filing");
      await performSearch(`"${companyName}" investor presentation`, "sec_filing");
    } else {
      limitations.push("Private company - SEC filings and earnings data unavailable");
    }

    // Tier 3: Best effort (may be paywalled)
      await performSearch(`"${companyName}" fintech analyst report research`, "analyst");
  }

  const filteredSources = dedupeSources(sources).filter((source) =>
    isLikelyRelevantSource(companyName, source)
  );

  // Calculate quality score
  const qualityScore = calculateResearchQuality(filteredSources, options.isPublic);

  // Extract stated strategy from sources
  const statedStrategy = await extractStatedStrategy(genAI, companyName, filteredSources);
  estimatedCost += 0.03; // Cost for strategy extraction

  // Extract financial context
  const financialContext = await extractFinancialContext(genAI, companyName, filteredSources);
  estimatedCost += 0.02; // Cost for financial extraction

  // Add limitations based on research results
  if (filteredSources.length < 3) {
    limitations.push("Limited public information available");
  }
  if (!filteredSources.some((s) => s.sourceType === "official")) {
    limitations.push("No official company sources found");
  }
  if (options.depth === "deep" && !filteredSources.some((s) => s.sourceType === "analyst")) {
    limitations.push("Analyst reports may be paywalled or unavailable");
  }

  return {
    sources: filteredSources,
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

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getSourceHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function isLowSignalSource(source: Pick<VerifiedSource, "title" | "url" | "sourceType" | "verificationStatus">) {
  if (source.sourceType === "official" || source.verificationStatus === "verified") {
    return false;
  }

  const host = getSourceHost(source.url);
  const title = normalizeText(source.title);

  if (LOW_SIGNAL_SOURCE_DOMAINS.some((domain) => host.includes(domain))) {
    return true;
  }

  if (LOW_SIGNAL_TITLE_PATTERNS.some((pattern) => title.includes(pattern))) {
    return true;
  }

  return false;
}

function dedupeSources(sources: VerifiedSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.url}|${source.title.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isLikelyRelevantSource(companyName: string, source: Pick<VerifiedSource, "title" | "snippet" | "url" | "sourceType">) {
  const company = normalizeText(companyName);
  const haystack = normalizeText(`${source.title} ${source.snippet} ${source.url}`);
  const hasCompanyMention = haystack.includes(company);
  const fintechHits = FINTECH_RELEVANCE_TERMS.filter((term) => haystack.includes(term)).length;
  const blocked = IRRELEVANT_SOURCE_PATTERNS.some((pattern) => haystack.includes(pattern));
  const officialHint = source.sourceType === "official" || source.url.includes(".gov");
  const disambiguationRule = COMPANY_DISAMBIGUATION_RULES[company];
  const verificationStatus = determineVerificationStatus(source.url, source.sourceType);

  if (blocked) return false;
  if (isLowSignalSource({ ...source, verificationStatus })) return false;
  if (disambiguationRule?.blockedAny.some((pattern) => haystack.includes(pattern))) {
    return false;
  }
  if (!hasCompanyMention && !officialHint) return false;
  if (company.split(" ").length === 1 && fintechHits === 0 && source.sourceType !== "official") {
    return false;
  }
  if (disambiguationRule && !disambiguationRule.requiredAny.some((pattern) => haystack.includes(pattern))) {
    return false;
  }

  return true;
}

function rankSourcesForPrompt(sources: VerifiedSource[]) {
  return [...sources].sort((left, right) => {
    const leftScore = rankSource(left);
    const rightScore = rankSource(right);
    return rightScore - leftScore;
  });
}

function rankSource(source: VerifiedSource) {
  return scoreRankedSource(source, {
    extraKeywordWeights: {
      "engine by starling": 4,
      "small business": 1,
      "digital wealth": 1,
    },
    isLowSignalSource: isLowSignalSource(source),
    lowSignalPenalty: 6,
  });
}

function closeOpenJsonStructures(text: string) {
  let fixed = text;
  const openBraces = (fixed.match(/\{/g) ?? []).length;
  const closeBraces = (fixed.match(/\}/g) ?? []).length;
  const openBrackets = (fixed.match(/\[/g) ?? []).length;
  const closeBrackets = (fixed.match(/\]/g) ?? []).length;

  if (closeBrackets < openBrackets) {
    fixed += "]".repeat(openBrackets - closeBrackets);
  }

  if (closeBraces < openBraces) {
    fixed += "}".repeat(openBraces - closeBraces);
  }

  return fixed;
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
      model: "gemini-flash-latest",
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    });

    const sourceText = rankSourcesForPrompt(sources)
      .slice(0, 6)
      .map((s) => `Source: ${s.title}\n${s.snippet}`)
      .join("\n\n");

    const prompt = `Based on these research sources about ${companyName}, summarize their publicly stated strategy, mission, and key priorities in 2-3 concise paragraphs. Use exact named systems, products, and partnerships when they appear in the sources. Focus on:
- Their stated mission and vision
- Key strategic priorities or focus areas
- Recent announcements about direction or growth plans
- Exact named strategic platforms, systems, or partnerships when supported by the source text

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
      model: "gemini-flash-latest",
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    });

    const sourceText = rankSourcesForPrompt(fundingSources)
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
            jsonText = closeOpenJsonStructures(jsonText);
            
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
    const prioritizedSources = rankSourcesForPrompt(research.sources).slice(0, 5);
    for (const source of prioritizedSources) {
      const snippet = source.snippet.trim().replace(/\s+/g, " ").slice(0, 220);
      text += `- [${source.verificationStatus} ${source.sourceType}] ${source.title}\n`;
      if (snippet) {
        text += `  Evidence: ${snippet}${source.snippet.length > 220 ? "..." : ""}\n`;
      }
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
