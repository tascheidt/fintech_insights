/**
 * Advanced Strategic Analysis using Gemini 3.1 Pro
 *
 * Features:
 * - Google Search tool for web grounding
 * - Historical context comparison
 * - Novelty detection and executive movement analysis
 */

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { buildHistoricalContext, formatHistoricalContextForPrompt, type HistoricalContext } from "./context-builder";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRO_MODEL = "gemini-3.1-pro-preview";
const FLASH_MODEL = "gemini-3-flash-preview";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

/**
 * Result from advanced job analysis
 *
 * TLDR-style additions:
 * - headline: Punchy, emoji-forward headline for digest display
 * - what_it_means: Plain-language takeaway for readers
 */
export interface AdvancedAnalyzeResult {
  /** Punchy headline with emoji (e.g., "🚀 Koho bets big on small businesses!") */
  headline: string;
  category: string;
  /** Conversational 2-3 sentence summary */
  insight_summary: string;
  /** Plain-language one-liner takeaway */
  what_it_means: string;
  strategic_signals: string[];
  is_new_direction: boolean;
  confidence: string;
  novelty_score: number;
  novelty_reasoning: string;
  is_executive_movement: boolean;
  executive_context?: string;
  strategic_hypothesis: string;
  web_corroboration?: string;
  model_reasoning: string;
}

export interface AnalyzeJobOptions {
  companyId: string;
  companyName: string;
  job: {
    title: string;
    standardized_department?: string | null;
    location?: string | null;
    description_text?: string | null;
  };
  historicalContext?: HistoricalContext;
  webSearchResults?: WebSearchResult[];
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * Advanced analysis prompt with TLDR-style punchy voice
 *
 * Key additions for TLDR style:
 * - headline: Punchy, emoji-forward headline (e.g., "🚀 Koho bets big on small businesses!")
 * - Conversational insight_summary in plain language
 * - what_it_means: Plain-language takeaway for the reader
 */
const ADVANCED_PROMPT = `You are a sharp fintech analyst who writes like Wealthsimple's TLDR newsletter - punchy, conversational, and fun to read. You spot strategic moves in hiring patterns and explain them in plain language.

## Company Historical Context
{historical_context}

## Recent Company News & Strategy (from web search)
{web_context}

## Current Job Posting to Analyze
Company: {company_name}
Job Title: {job_title}
Department: {department}
Location: {location}

Full Job Description:
{description}

## Your Analysis Tasks

1. PUNCHY HEADLINE:
   - Write a catchy, emoji-forward headline (8 words max) that captures the strategic signal
   - Start with ONE relevant emoji that fits the vibe
   - Use active, punchy language like TLDR newsletter does
   - Examples: "🤖 Wealthsimple doubles down on AI", "💼 Koho bets big on small businesses!", "🚀 Neo's hiring spree continues"

2. NOVELTY ASSESSMENT (1-10 scale):
   - Compare this role against the company's historical hiring patterns
   - Is this a continuation of existing strategy (1-4)?
   - Is this a new direction or pivot (7-10)?
   - Is this an expansion/scale of existing approach (5-6)?
   - Provide detailed reasoning for your score

3. EXECUTIVE MOVEMENT DETECTION:
   - Is this a leadership/C-suite/VP+ level hire?
   - Does this signal a new function, reorganization, or strategic shift?
   - What does this executive hire imply about company direction?

4. STRATEGIC HYPOTHESIS:
   - What is the most likely strategic reason for this hire?
   - How does it fit (or not fit) with recent company news and strategy?
   - What does this signal about the company's priorities?

5. WEB-GROUNDED CONTEXT:
   - How does this role correlate with recent company news, funding, product launches, or market moves?
   - Does the web context support or contradict the signals from this posting?

6. CONFIDENCE & REASONING:
   - How confident are you in this analysis? (high/medium/low)
   - Provide detailed reasoning for your confidence level

## Writing Style Rules
- Write insight_summary in 2-3 casual, conversational sentences - like you're explaining to a smart friend
- Avoid corporate jargon - say "betting big" not "making strategic investments"
- what_it_means should be one plain-language takeaway a reader can immediately understand

Respond with a JSON object containing:
{
  "headline": "🚀 Punchy 8-word-max headline with ONE emoji at start",
  "category": "one of: expansion, new-product, technology, operational, compliance, customer, data, marketing, leadership, other",
  "insight_summary": "2-3 casual sentences explaining what this hire signals - write like you're texting a smart friend",
  "what_it_means": "One plain-language sentence: what should readers take away from this?",
  "strategic_signals": ["signal 1", "signal 2", "signal 3", "signal 4"],
  "is_new_direction": true or false,
  "confidence": "high, medium, or low",
  "novelty_score": 1-10 integer,
  "novelty_reasoning": "detailed explanation of why this score was assigned",
  "is_executive_movement": true or false,
  "executive_context": "if executive_movement is true, explain the significance",
  "strategic_hypothesis": "your best hypothesis about why this role exists and what it signals",
  "web_corroboration": "how recent company news/strategy relates to this posting",
  "model_reasoning": "your detailed reasoning process and confidence assessment"
}`;

function buildPrompt(
  companyName: string,
  job: AnalyzeJobOptions["job"],
  historicalText: string,
  webText: string
): string {
  return ADVANCED_PROMPT
    .replace("{historical_context}", historicalText)
    .replace("{web_context}", webText)
    .replace("{company_name}", companyName)
    .replace("{job_title}", job.title)
    .replace("{department}", job.standardized_department ?? "Not specified")
    .replace("{location}", job.location ?? "Not specified")
    .replace("{description}", job.description_text ?? "No description available");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true for quota / rate-limit errors from the Gemini API. */
function isQuotaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as Record<string, unknown>;
  return (
    e["status"] === 429 ||
    (typeof e["message"] === "string" &&
      (e["message"].includes("quota") ||
        e["message"].includes("limit") ||
        e["message"].includes("exceeded")))
  );
}

/**
 * Extract grounding results from a Gemini response.
 * The SDK types don't fully expose groundingMetadata, so we read it via
 * the raw candidates array.
 */
function extractGroundingResults(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any
): WebSearchResult[] {
  try {
    const chunks =
      response?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    return (chunks as Array<{ web?: { title?: string; uri?: string; snippet?: string } }>)
      .filter((c) => c.web?.uri)
      .slice(0, 5)
      .map((c, i) => ({
        title: c.web?.title ?? `Search result ${i + 1}`,
        snippet: c.web?.snippet ?? "",
        url: c.web?.uri ?? "",
      }));
  } catch {
    return [];
  }
}

function formatWebContext(results: WebSearchResult[]): string {
  if (results.length === 0) {
    return "No recent company news found via web search.";
  }
  let text = "Recent company news and strategy updates:\n\n";
  for (const result of results) {
    text += `- ${result.title}\n  ${result.snippet}\n  Source: ${result.url}\n\n`;
  }
  return text;
}

function parseAnalysisResult(
  parsed: Record<string, unknown>,
  companyName: string
): AdvancedAnalyzeResult {
  const noveltyScore =
    typeof parsed["novelty_score"] === "number"
      ? Math.max(1, Math.min(10, Math.round(parsed["novelty_score"])))
      : 5;

  return {
    headline: String(parsed["headline"] ?? `📊 ${companyName} is hiring`),
    category: String(parsed["category"] ?? "other"),
    insight_summary: String(parsed["insight_summary"] ?? ""),
    what_it_means: String(parsed["what_it_means"] ?? ""),
    strategic_signals: Array.isArray(parsed["strategic_signals"])
      ? (parsed["strategic_signals"] as string[])
      : [],
    is_new_direction: Boolean(parsed["is_new_direction"]),
    confidence: String(parsed["confidence"] ?? "medium"),
    novelty_score: noveltyScore,
    novelty_reasoning: String(parsed["novelty_reasoning"] ?? ""),
    is_executive_movement: Boolean(parsed["is_executive_movement"]),
    executive_context: parsed["executive_context"]
      ? String(parsed["executive_context"])
      : undefined,
    strategic_hypothesis: String(parsed["strategic_hypothesis"] ?? ""),
    web_corroboration: parsed["web_corroboration"]
      ? String(parsed["web_corroboration"])
      : undefined,
    model_reasoning: String(parsed["model_reasoning"] ?? ""),
  };
}

// ---------------------------------------------------------------------------
// Web Search
// ---------------------------------------------------------------------------

/**
 * Perform web search for company strategy/news using Gemini grounding.
 * Falls back gracefully if quota is exceeded or model is unavailable.
 */
export async function performWebSearch(companyName: string): Promise<WebSearchResult[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn("GEMINI_API_KEY not configured, skipping web search");
    return [];
  }

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: PRO_MODEL,
      // @ts-expect-error - googleSearch tool exists at runtime but types may be outdated
      tools: [{ googleSearch: {} }],
    });

    const searchQuery = `Recent news, strategy updates, funding, or product launches for ${companyName} fintech company in 2025 or 2026`;

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: `Search the web for: ${searchQuery}. Summarise the top 5 most relevant results.` }],
      }],
    });

    // Extract structured grounding results from groundingMetadata
    const groundingResults = extractGroundingResults(result.response);
    if (groundingResults.length > 0) {
      return groundingResults;
    }

    // Fallback: pull any URLs from the text response
    const responseText = result.response.text();
    const urls = responseText.match(/https?:\/\/[^\s]+/g) ?? [];
    if (urls.length > 0) {
      return urls.slice(0, 5).map((url, i) => ({
        title: `Search result ${i + 1}`,
        snippet: responseText.substring(0, 200) + "...",
        url,
      }));
    }

    return [];
  } catch (error: unknown) {
    if (isQuotaError(error)) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`Web search quota exceeded: ${msg}. Continuing without web context.`);
      return [];
    }
    console.error("Web search error:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Advanced job analysis using Gemini 3.1 Pro with web search grounding.
 * Falls back to Flash if the Pro quota is exceeded.
 */
export async function analyzeJobAdvanced(
  options: AnalyzeJobOptions
): Promise<AdvancedAnalyzeResult | null> {
  const { companyId, companyName, job, historicalContext, webSearchResults } = options;
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    console.error("GEMINI_API_KEY not configured");
    return null;
  }

  try {
    const context = historicalContext ?? (await buildHistoricalContext(companyId, 90));
    const webResults = webSearchResults ?? (await performWebSearch(companyName));

    const prompt = buildPrompt(
      companyName,
      job,
      formatHistoricalContextForPrompt(context),
      formatWebContext(webResults)
    );

    const genAI = new GoogleGenerativeAI(key);

    let model: GenerativeModel = genAI.getGenerativeModel({
      model: PRO_MODEL,
      // @ts-expect-error - googleSearch tool exists at runtime but types may be outdated
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 64000,
        responseMimeType: "application/json",
      },
    });

    let result;
    try {
      result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
    } catch (error: unknown) {
      if (isQuotaError(error)) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`${PRO_MODEL} quota exceeded: ${msg}. Falling back to ${FLASH_MODEL}.`);
        model = genAI.getGenerativeModel({
          model: FLASH_MODEL,
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 64000,
            responseMimeType: "application/json",
          },
        });
        result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });
      } else {
        throw error;
      }
    }

    const text = result.response.text()?.trim() ?? "{}";
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return parseAnalysisResult(parsed, companyName);
  } catch (error: unknown) {
    console.error("Advanced Gemini analysis error:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batch Analysis
// ---------------------------------------------------------------------------

/**
 * Batch analyze multiple jobs with shared context.
 * Builds historical context and performs web search once, then reuses for all jobs.
 */
export async function analyzeJobsAdvanced(
  companyId: string,
  companyName: string,
  jobs: Array<{
    id: string;
    title: string;
    standardized_department?: string | null;
    location?: string | null;
    description_text?: string | null;
  }>
): Promise<Array<{ jobId: string; result: AdvancedAnalyzeResult }>> {
  const historicalContext = await buildHistoricalContext(companyId, 90);
  const webResults = await performWebSearch(companyName);

  const results: Array<{ jobId: string; result: AdvancedAnalyzeResult }> = [];

  for (const job of jobs) {
    const result = await analyzeJobAdvanced({
      companyId,
      companyName,
      job: {
        title: job.title,
        standardized_department: job.standardized_department,
        location: job.location,
        description_text: job.description_text,
      },
      historicalContext,
      webSearchResults: webResults,
    });

    if (result) {
      results.push({ jobId: job.id, result });
    }
  }

  return results;
}
