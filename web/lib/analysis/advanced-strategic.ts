/**
 * Advanced Strategic Analysis using Gemini Pro
 *
 * Features:
 * - Google Search tool for web grounding (two-stage: pre-fetch + model grounding during analysis)
 * - Historical context comparison (180-day window)
 * - Novelty detection and executive movement analysis
 */

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { buildHistoricalContext, formatHistoricalContextForPrompt, type HistoricalContext } from "./context-builder";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRO_MODEL = "gemini-pro-latest";
const FLASH_MODEL = "gemini-3-flash-preview";

/** How many days of hiring history to include as context for each job analysis. */
const HISTORICAL_CONTEXT_DAYS = 180;

/** Max grounding chunks to extract from the web search response. */
const MAX_GROUNDING_CHUNKS = 8;

/** Max concurrent LLM calls during batch analysis. */
const BATCH_CONCURRENCY = 3;

const VALID_CATEGORIES = [
  "expansion", "new-product", "technology", "operational",
  "compliance", "customer", "data", "marketing", "leadership", "other",
] as const;
type AnalysisCategory = typeof VALID_CATEGORIES[number];

const VALID_CONFIDENCE = ["high", "medium", "low"] as const;
type ConfidenceLevel = typeof VALID_CONFIDENCE[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

/**
 * Rich web research context returned from performWebSearch.
 * Carries both the model's synthesized narrative AND individual source chunks.
 *
 * The synthesis text is typically the most valuable signal — it's the model's
 * prose summary of what it found. The results array provides source attribution.
 */
export interface WebSearchContext {
  /** Model's synthesized prose summary of its research findings. */
  synthesis: string;
  /** Individual grounding source chunks (title, snippet, URL). */
  results: WebSearchResult[];
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
  category: AnalysisCategory;
  /** Conversational 2-3 sentence summary */
  insight_summary: string;
  /** Plain-language one-liner takeaway */
  what_it_means: string;
  strategic_signals: string[];
  is_new_direction: boolean;
  confidence: ConfidenceLevel;
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
  /** Pre-fetched web research context. If omitted, performWebSearch is called automatically. */
  webSearchContext?: WebSearchContext;
  /**
   * Gemini model for the main analysis JSON call. Default: `gemini-pro-latest`.
   */
  analysisModel?: string;
  /**
   * If true, attach Google Search grounding on the analysis call (production default).
   * Set false to measure “prompt + context only” cost and behavior.
   */
  analysisGoogleSearch?: boolean;
  /**
   * When the primary analysis model is Pro, fall back to Flash on quota errors.
   * Set false for A/B evaluations so a Pro failure does not swap in Flash mid-run.
   * Default: true.
   */
  analysisQuotaFallback?: boolean;
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

## Recent Company News & Strategy (from web research)
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
  "executive_context": "significance of this executive hire, or null if not an executive role",
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
 * Extract grounding source chunks from a Gemini response.
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
      .slice(0, MAX_GROUNDING_CHUNKS)
      .map((c, i) => ({
        title: c.web?.title ?? `Search result ${i + 1}`,
        snippet: c.web?.snippet ?? "",
        url: c.web?.uri ?? "",
      }));
  } catch {
    return [];
  }
}

/**
 * Format web research context for the analysis prompt.
 *
 * Includes the model's synthesized narrative first (highest signal), followed
 * by individual source attribution.
 */
function formatWebContext(ctx: WebSearchContext): string {
  const parts: string[] = [];

  if (ctx.synthesis) {
    parts.push("### Research Summary\n" + ctx.synthesis);
  }

  if (ctx.results.length > 0) {
    const sourceLines = ctx.results
      .filter((r) => r.url)
      .map((r) => {
        const snippet = r.snippet ? `\n  ${r.snippet}` : "";
        return `- ${r.title}${snippet}\n  Source: ${r.url}`;
      })
      .join("\n");
    parts.push("### Sources\n" + sourceLines);
  }

  return parts.length > 0
    ? parts.join("\n\n")
    : "No recent company news found via web research.";
}

function normalizeCategory(raw: unknown): AnalysisCategory {
  const s = String(raw ?? "").toLowerCase().trim();
  return (VALID_CATEGORIES as readonly string[]).includes(s)
    ? (s as AnalysisCategory)
    : "other";
}

function normalizeConfidence(raw: unknown): ConfidenceLevel {
  const s = String(raw ?? "").toLowerCase().trim();
  return (VALID_CONFIDENCE as readonly string[]).includes(s)
    ? (s as ConfidenceLevel)
    : "medium";
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
    category: normalizeCategory(parsed["category"]),
    insight_summary: String(parsed["insight_summary"] ?? ""),
    what_it_means: String(parsed["what_it_means"] ?? ""),
    strategic_signals: Array.isArray(parsed["strategic_signals"])
      ? (parsed["strategic_signals"] as string[])
      : [],
    is_new_direction: Boolean(parsed["is_new_direction"]),
    confidence: normalizeConfidence(parsed["confidence"]),
    novelty_score: noveltyScore,
    novelty_reasoning: String(parsed["novelty_reasoning"] ?? ""),
    is_executive_movement: Boolean(parsed["is_executive_movement"]),
    executive_context:
      parsed["executive_context"] && parsed["executive_context"] !== "null"
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
// Web Research
// ---------------------------------------------------------------------------

/**
 * Perform web research for a company using Gemini grounding.
 *
 * Returns both the model's synthesized narrative (the primary signal) and the
 * individual grounding source chunks. Falls back gracefully if quota is
 * exceeded or the model is unavailable.
 *
 * NOTE: This is a separate pre-fetch step. The analysis model in
 * analyzeJobAdvanced also has googleSearch available so it can do targeted
 * follow-up searches during reasoning. These two stages are intentionally
 * complementary: the pre-fetch provides general company context, while the
 * analysis model can dig deeper on specific signals it encounters.
 */
export async function performWebSearch(companyName: string): Promise<WebSearchContext> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn("GEMINI_API_KEY not configured, skipping web search");
    return { synthesis: "", results: [] };
  }

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: PRO_MODEL,
      // @ts-expect-error - googleSearch tool exists at runtime but types may be outdated
      tools: [{ googleSearch: {} }],
    });

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - 18);
    const recentCutoff = new Date(now);
    recentCutoff.setMonth(recentCutoff.getMonth() - 3);

    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    const searchQuery =
      `${companyName} fintech company news, strategy, funding, partnerships, or product launches ` +
      `from ${fmt(cutoff)} to ${fmt(now)}. ` +
      `Prioritise results from ${fmt(recentCutoff)} to ${fmt(now)} first.`;

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{
          text:
            `Research: ${searchQuery}. ` +
            `Write a 3-5 sentence summary of the most significant strategic developments, ` +
            `then list the top ${MAX_GROUNDING_CHUNKS} most relevant sources.`,
        }],
      }],
    });

    // The model's text response is the synthesized research narrative
    const synthesis = result.response.text()?.trim() ?? "";

    // Extract individual grounding source chunks for attribution
    const groundingResults = extractGroundingResults(result.response);

    // Fallback: if grounding metadata is empty, pull URLs from the text
    if (groundingResults.length === 0) {
      const urls = synthesis.match(/https?:\/\/[^\s]+/g) ?? [];
      const fallbackResults = urls.slice(0, MAX_GROUNDING_CHUNKS).map((url, i) => ({
        title: `Source ${i + 1}`,
        snippet: "",
        url,
      }));
      return { synthesis, results: fallbackResults };
    }

    return { synthesis, results: groundingResults };
  } catch (error: unknown) {
    if (isQuotaError(error)) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`Web search quota exceeded: ${msg}. Continuing without web context.`);
      return { synthesis: "", results: [] };
    }
    console.error("Web search error:", error);
    return { synthesis: "", results: [] };
  }
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Advanced job analysis using Gemini Pro with web search grounding.
 * Falls back to Flash if the Pro quota is exceeded.
 *
 * Two-stage web research:
 * 1. Pre-fetch: performWebSearch provides a synthesized company overview
 * 2. Analysis: the Pro model can do additional targeted searches during reasoning
 */
export async function analyzeJobAdvanced(
  options: AnalyzeJobOptions
): Promise<AdvancedAnalyzeResult | null> {
  const {
    companyId,
    companyName,
    job,
    historicalContext,
    webSearchContext,
    analysisModel = PRO_MODEL,
    analysisGoogleSearch = true,
    analysisQuotaFallback = true,
  } = options;
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    console.error("GEMINI_API_KEY not configured");
    return null;
  }

  const generationConfig = {
    temperature: 0.4,
    maxOutputTokens: 8192,
    responseMimeType: "application/json" as const,
  };

  try {
    const context =
      historicalContext ?? (await buildHistoricalContext(companyId, HISTORICAL_CONTEXT_DAYS));
    const webCtx =
      webSearchContext ?? (await performWebSearch(companyName));

    const prompt = buildPrompt(
      companyName,
      job,
      formatHistoricalContextForPrompt(context),
      formatWebContext(webCtx)
    );

    const genAI = new GoogleGenerativeAI(key);

    const buildAnalysisModel = (modelId: string, withSearch: boolean): GenerativeModel =>
      genAI.getGenerativeModel({
        model: modelId,
        ...(withSearch
          ? {
              // @ts-expect-error - googleSearch tool exists at runtime but types may be outdated
              tools: [{ googleSearch: {} }],
            }
          : {}),
        generationConfig,
      });

    let model: GenerativeModel = buildAnalysisModel(analysisModel, analysisGoogleSearch);

    let result;
    try {
      result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
    } catch (error: unknown) {
      const allowFallback =
        analysisQuotaFallback &&
        analysisModel === PRO_MODEL &&
        analysisGoogleSearch;
      if (allowFallback && isQuotaError(error)) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`${analysisModel} quota exceeded: ${msg}. Falling back to ${FLASH_MODEL}.`);
        model = genAI.getGenerativeModel({
          model: FLASH_MODEL,
          generationConfig,
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
 *
 * Builds historical context and performs web research once, then reuses for all
 * jobs. Runs up to BATCH_CONCURRENCY jobs in parallel to reduce total wall time
 * without triggering API rate limits.
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
  const [historicalContext, webSearchContext] = await Promise.all([
    buildHistoricalContext(companyId, HISTORICAL_CONTEXT_DAYS),
    performWebSearch(companyName),
  ]);

  const results: Array<{ jobId: string; result: AdvancedAnalyzeResult }> = [];

  // Process in parallel chunks to balance throughput vs rate-limit safety
  for (let i = 0; i < jobs.length; i += BATCH_CONCURRENCY) {
    const chunk = jobs.slice(i, i + BATCH_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (job) => {
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
          webSearchContext,
        });
        return result ? { jobId: job.id, result } : null;
      })
    );

    for (const r of chunkResults) {
      if (r) results.push(r);
    }
  }

  return results;
}
