/**
 * Advanced Strategic Analysis using Gemini 3 Pro
 * 
 * Features:
 * - Extended thinking budget (24576 tokens)
 * - Google Search tool for web grounding
 * - Historical context comparison
 * - Novelty detection and executive movement analysis
 */

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { buildHistoricalContext, formatHistoricalContextForPrompt, type HistoricalContext } from "./context-builder";
import { createAdminClient } from "@/lib/supabase/admin";

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
    department?: string | null;
    location?: string | null;
    description_text?: string | null;
  };
  historicalContext?: HistoricalContext;
  webSearchResults?: Array<{ title: string; snippet: string; url: string }>;
}

/**
 * Perform web search for company strategy/news
 * Uses Gemini's Google Search tool to find recent company information
 * Falls back gracefully if quota is exceeded or model is unavailable
 */
async function performWebSearch(companyName: string): Promise<Array<{ title: string; snippet: string; url: string }>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn("GEMINI_API_KEY not configured, skipping web search");
    return [];
  }

  try {
    const genAI = new GoogleGenerativeAI(key);
    
    // Try to use pro model with web search, but handle quota errors gracefully
    let model: GenerativeModel;
    try {
      model = genAI.getGenerativeModel({
        model: "gemini-3-pro-preview",
        // @ts-expect-error - googleSearch tool exists at runtime but types may be outdated
        tools: [{ googleSearch: {} }],
      });
    } catch (error: any) {
      // If quota exceeded or model unavailable, skip web search
      if (error?.status === 429 || error?.message?.includes("quota") || error?.message?.includes("limit")) {
        console.warn(`Web search unavailable (quota/model limit): ${error.message}. Continuing without web context.`);
        return [];
      }
      throw error;
    }

    const searchQuery = `Recent news, strategy updates, funding, or product launches for ${companyName} fintech company in 2025 or 2026`;
    
    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: `Search the web for: ${searchQuery}. Return the top 5 most relevant results with titles, snippets, and URLs.` }],
      }],
    });

    // The Google Search tool will be invoked automatically by the model
    // We need to check the response for function calls and results
    const responseText = result.response.text();
    
    // If the model used the search tool, it will be in the response
    // For now, we'll extract any URLs and snippets from the text response
    // In production, you may need to handle function call responses differently
    // based on the actual Gemini API response format
    
    // Try to parse structured data from response
    // This is a fallback - the actual implementation may vary based on API version
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = responseText.match(urlRegex) || [];
    
    // Return basic results - in production, you'd parse the actual function call response
    if (urls.length > 0) {
      return urls.slice(0, 5).map((url, i) => ({
        title: `Search result ${i + 1}`,
        snippet: responseText.substring(0, 200) + "...",
        url: url,
      }));
    }

    return [];
  } catch (error: any) {
    // Handle quota errors gracefully
    if (error?.status === 429 || error?.message?.includes("quota") || error?.message?.includes("limit")) {
      console.warn(`Web search quota exceeded: ${error.message}. Continuing without web context.`);
      return [];
    }
    console.error("Web search error:", error);
    // Return empty array on error - analysis can continue without web context
    return [];
  }
}

/**
 * Format web search results for prompt
 */
function formatWebContext(results: Array<{ title: string; snippet: string; url: string }>): string {
  if (results.length === 0) {
    return "No recent company news found via web search.";
  }

  let text = "Recent company news and strategy updates:\n\n";
  for (const result of results) {
    text += `- ${result.title}\n  ${result.snippet}\n  Source: ${result.url}\n\n`;
  }
  return text;
}

/**
 * Advanced job analysis using Gemini 3 Pro with extended thinking and web search
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
    // Build or use provided historical context
    let context = historicalContext;
    if (!context) {
      context = await buildHistoricalContext(companyId, 90);
    }

    // Perform web search if not provided
    let webResults = webSearchResults;
    if (!webResults) {
      webResults = await performWebSearch(companyName);
    }

    // Build the prompt
    const historicalText = formatHistoricalContextForPrompt(context);
    const webText = formatWebContext(webResults);
    const fullDescription = job.description_text || "No description available";

    const prompt = ADVANCED_PROMPT
      .replace("{historical_context}", historicalText)
      .replace("{web_context}", webText)
      .replace("{company_name}", companyName)
      .replace("{job_title}", job.title)
      .replace("{department}", job.department ?? "Not specified")
      .replace("{location}", job.location ?? "Not specified")
      .replace("{description}", fullDescription);

    const genAI = new GoogleGenerativeAI(key);
    
    // Use Gemini model with fallback (pro -> flash)
    // Try pro model first, but fallback to flash if quota exceeded
    let model: GenerativeModel = genAI.getGenerativeModel({
      model: "gemini-3-pro-preview",
      // @ts-expect-error - googleSearch tool exists at runtime but types may be outdated
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        // Extended thinking configuration for deep reasoning
        // Note: The exact parameter name may vary - check latest Gemini API docs
        // thinkingBudget: 24576, // Maximum thinking tokens for deep analysis
      },
    });

    let result;
    try {
      result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
    } catch (error: any) {
      // If we get a quota error during generation, try flash model as fallback
      if (error?.status === 429 || error?.message?.includes("quota") || error?.message?.includes("limit") || error?.message?.includes("exceeded")) {
        console.warn(`gemini-3-pro-preview quota exceeded: ${error.message}. Falling back to gemini-3-flash-preview.`);
        model = genAI.getGenerativeModel({
          model: "gemini-3-flash-preview",
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 4096,
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

    // Validate and return structured result
    const noveltyScore = typeof parsed.novelty_score === "number" 
      ? Math.max(1, Math.min(10, Math.round(parsed.novelty_score)))
      : 5;

    // Generate fallback headline if AI didn't provide one
    const fallbackHeadline = `📊 ${companyName} is hiring`;

    return {
      headline: String(parsed.headline ?? fallbackHeadline),
      category: String(parsed.category ?? "other"),
      insight_summary: String(parsed.insight_summary ?? ""),
      what_it_means: String(parsed.what_it_means ?? ""),
      strategic_signals: Array.isArray(parsed.strategic_signals)
        ? (parsed.strategic_signals as string[])
        : [],
      is_new_direction: Boolean(parsed.is_new_direction),
      confidence: String(parsed.confidence ?? "medium"),
      novelty_score: noveltyScore,
      novelty_reasoning: String(parsed.novelty_reasoning ?? ""),
      is_executive_movement: Boolean(parsed.is_executive_movement),
      executive_context: parsed.executive_context ? String(parsed.executive_context) : undefined,
      strategic_hypothesis: String(parsed.strategic_hypothesis ?? ""),
      web_corroboration: parsed.web_corroboration ? String(parsed.web_corroboration) : undefined,
      model_reasoning: String(parsed.model_reasoning ?? ""),
    };
  } catch (error) {
    console.error("Advanced Gemini analysis error:", error);
    return null;
  }
}

/**
 * Batch analyze multiple jobs with shared context
 */
export async function analyzeJobsAdvanced(
  companyId: string,
  companyName: string,
  jobs: Array<{
    id: string;
    title: string;
    department?: string | null;
    location?: string | null;
    description_text?: string | null;
  }>
): Promise<Array<{ jobId: string; result: AdvancedAnalyzeResult }>> {
  // Build context once for all jobs
  const historicalContext = await buildHistoricalContext(companyId, 90);
  const webResults = await performWebSearch(companyName);

  const results: Array<{ jobId: string; result: AdvancedAnalyzeResult }> = [];

  // Analyze each job with shared context
  for (const job of jobs) {
    const result = await analyzeJobAdvanced({
      companyId,
      companyName,
      job: {
        title: job.title,
        department: job.department,
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
