/**
 * Company-Level Strategic Insights Generator
 * 
 * Orchestrates the generation of company-level strategic insights by:
 * 1. Building extended historical context (hiring patterns, function analysis)
 * 2. Performing deep research (company strategy, financials, news)
 * 3. Comparing hiring patterns to stated strategy
 * 4. Generating strategic analysis via LLM
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getVoiceDirective } from "@/lib/ai/voice";
import { checkVoice } from "@/lib/ai/voice-validator";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildExtendedHistoricalContext,
  formatExtendedContextForPrompt,
  type ExtendedHistoricalContext,
  type FunctionStats,
  type FunctionTrend,
} from "./context-builder";
import {
  detectCompanyType,
  performDeepResearch,
  formatResearchForPrompt,
  type CompanyType,
  type ResearchResult,
  type VerifiedSource,
  type FinancialContext,
} from "./company-research";

// ============================================================================
// Types
// ============================================================================

export interface GenerateCompanyInsightOptions {
  periodDays?: number; // default 90
  researchDepth?: "basic" | "deep"; // default 'deep'
  compareToPrevious?: boolean; // default true
  forceRegenerate?: boolean; // default false
}

export interface CompanyInsight {
  id: string;
  companyId: string;
  analysisPeriodStart: Date;
  analysisPeriodEnd: Date;
  generatedAt: Date;

  // Core analysis
  executiveSummary: string;
  strategicHypothesis: string;
  confidence: "high" | "medium" | "low";

  // Display fields for dashboard highlights
  headline: string | null;           // Plain analytical headline (6–12 words, no emoji)
  significanceScore: number | null;  // 1-10 ranking for dashboard sorting
  keySignal: string | null;          // One-liner explaining strategic signal

  // Function analysis
  coreFunctions: FunctionStats[];
  functionChanges: FunctionChange[];

  // Hiring trends
  hiringTrends: Record<string, unknown>;
  newDirections: string[];

  // External research
  isPublicCompany: boolean;
  statedStrategy: string | null;
  financialContext: FinancialContext | null;
  analystReports: unknown[];
  researchSources: VerifiedSource[];
  researchQualityScore: number;

  // Comparison
  alignmentAnalysis: string;
  discrepancies: Discrepancy[];
  strategicImplications: string;

  // Metadata
  modelReasoning: string;
  researchDepth: "basic" | "deep";
  previousInsightId: string | null;
  generationCostEstimate: number;
}

export interface FunctionChange {
  category: string;
  label: string;
  previousCount: number;
  currentCount: number;
  changePercent: number;
  trend: "increased" | "decreased" | "new" | "eliminated" | "stable";
}

export interface Discrepancy {
  area: string;
  statedStrategy: string;
  actualHiring: string;
  implication: string;
  severity: "high" | "medium" | "low";
}

export interface AlignmentAnalysis {
  alignmentScore: number; // 1-10
  alignedAreas: string[];
  discrepancies: Discrepancy[];
  strategicImplications: string;
}

const COMPANY_INSIGHT_TIMEOUT_MS = 45000;

function isMissingInsightLockInfrastructure(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "42883" ||
    error.code === "PGRST205" ||
    message.includes("insight_generation_locks") ||
    message.includes("cleanup_expired_insight_locks")
  );
}

// ============================================================================
// Main Generation Function
// ============================================================================

/**
 * Generate a company-level strategic insight
 */
export async function generateCompanyInsight(
  companyId: string,
  companyName: string,
  options: GenerateCompanyInsightOptions = {}
): Promise<CompanyInsight> {
  const startTime = Date.now();
  const supabase = createAdminClient();
  
  const periodDays = options.periodDays ?? 90;
  const researchDepth = options.researchDepth ?? "deep";
  const compareToPrevious = options.compareToPrevious ?? true;

  // Track if we acquired a lock so we can release it in finally block
  let lockAcquired = false;

  try {
    // Step 0: Acquire processing lock to prevent concurrent generation
    // This must happen BEFORE any other checks to prevent race conditions
    if (!options.forceRegenerate) {
      const lockExpiresAt = new Date();
      lockExpiresAt.setHours(lockExpiresAt.getHours() + 1); // Lock expires in 1 hour

      const { error: lockError } = await supabase
        .from("insight_generation_locks")
        .insert({
          company_id: companyId,
          locked_at: new Date().toISOString(),
          expires_at: lockExpiresAt.toISOString(),
        });

      // If lock already exists, another process is generating an insight
      if (lockError) {
        if (isMissingInsightLockInfrastructure(lockError)) {
          console.warn(
            "Insight lock infrastructure is unavailable; continuing without concurrency locks."
          );
        } else {
        // Check if it's a unique constraint violation (lock exists)
          if (lockError.code === "23505") {
            throw new Error(
              `Insight generation already in progress for ${companyName}. Please wait for it to complete.`
            );
          }
          throw new Error(`Failed to acquire processing lock: ${lockError.message}`);
        }
      }
      lockAcquired = !lockError;
    }

    // Step 1: Check for recent insight (rate limiting) - double-check after acquiring lock
    if (!options.forceRegenerate) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: recentInsight } = await supabase
        .from("company_insights")
        .select("id, generated_at")
        .eq("company_id", companyId)
        .gte("generated_at", sevenDaysAgo.toISOString())
        .order("generated_at", { ascending: false })
        .limit(1)
        .single();

      if (recentInsight) {
        throw new Error(
          `Recent insight exists (generated ${new Date(recentInsight.generated_at).toLocaleDateString()}). Use forceRegenerate to override.`
        );
    }
  }

    // Step 2: Get previous insight for comparison
    type PreviousInsightData = {
      id: string;
      core_functions: FunctionStats[];
      headline: string | null;
      key_signal: string | null;
      executive_summary: string | null;
    };
    let previousInsight: PreviousInsightData | null = null;
    if (compareToPrevious) {
      const { data } = await supabase
        .from("company_insights")
        .select("id, core_functions, headline, key_signal, executive_summary")
        .eq("company_id", companyId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .single();
      
      if (data) {
        previousInsight = {
          id: data.id as string,
          core_functions: (data.core_functions as FunctionStats[]) || [],
          headline: (data.headline as string | null) ?? null,
          key_signal: (data.key_signal as string | null) ?? null,
          executive_summary: (data.executive_summary as string | null) ?? null,
        };
      }
    }

    // Step 3: Build extended historical context (reuses context-builder.ts)
    console.log(`Building historical context for ${companyName}...`);
    const context = await buildExtendedHistoricalContext(companyId, periodDays);

    // Step 4: Detect company type (public vs private)
    console.log(`Detecting company type for ${companyName}...`);
    const companyType = await detectCompanyType(companyName);

    // Step 5: Perform deep research
    console.log(`Performing ${researchDepth} research for ${companyName}...`);
    const research = await performDeepResearch(companyName, {
      isPublic: companyType.isPublic,
      depth: researchDepth,
    });

    // Step 6: Generate insight via LLM
    console.log(`Generating strategic insight for ${companyName}...`);
    const generatedInsight = await generateInsightWithLLM(
      companyName,
      context,
      research,
      companyType,
      previousInsight
    );

    // Step 7: Calculate function changes
    const functionChanges = calculateFunctionChanges(
      context.functionBreakdown,
      previousInsight?.core_functions || []
    );

    // Step 8: Calculate total cost estimate
    const llmCost = 0.05; // Estimated cost for LLM generation
    const totalCost = research.estimatedCost + llmCost;

    // Step 9: Store the insight
    const now = new Date();
    const insightData = {
      company_id: companyId,
      analysis_period_start: context.periodStart.toISOString(),
      analysis_period_end: context.periodEnd.toISOString(),
      generated_at: now.toISOString(),

      executive_summary: generatedInsight.executiveSummary,
      strategic_hypothesis: generatedInsight.strategicHypothesis,
      confidence: generatedInsight.confidence,

      // Display fields for dashboard highlights
      headline: generatedInsight.headline,
      significance_score: generatedInsight.significanceScore,
      key_signal: generatedInsight.keySignal,

      core_functions: context.functionBreakdown,
      function_changes: functionChanges,

      hiring_trends: {
        byDepartment: context.hiringTrends,
        byFunction: context.functionTrends,
        executives: context.recentExecutiveHires,
      },
      new_directions: generatedInsight.newDirections,

      is_public_company: companyType.isPublic,
      stated_strategy: research.statedStrategy,
      financial_context: research.financialContext || {},
      analyst_reports: [],
      research_sources: research.sources,
      research_quality_score: research.qualityScore,

      alignment_analysis: generatedInsight.alignmentAnalysis,
      discrepancies: generatedInsight.discrepancies,
      strategic_implications: generatedInsight.strategicImplications,

      model_reasoning: generatedInsight.modelReasoning,
      research_depth: researchDepth,
      previous_insight_id: previousInsight?.id || null,
      generation_cost_estimate: totalCost,
    };

    const { data: inserted, error } = await supabase
      .from("company_insights")
      .insert(insightData)
      .select("id")
      .single();

    if (error) {
      console.error("Error storing company insight:", error);
      throw new Error(`Failed to store insight: ${error.message}`);
    }

    console.log(`Company insight generated successfully in ${Date.now() - startTime}ms`);

    // Release lock on successful completion
    if (lockAcquired) {
      await supabase
        .from("insight_generation_locks")
        .delete()
        .eq("company_id", companyId);
      lockAcquired = false;
    }

    return {
      id: inserted.id,
      companyId,
      analysisPeriodStart: context.periodStart,
      analysisPeriodEnd: context.periodEnd,
      generatedAt: now,
      executiveSummary: generatedInsight.executiveSummary,
      strategicHypothesis: generatedInsight.strategicHypothesis,
      confidence: generatedInsight.confidence,
      // Display fields for dashboard highlights
      headline: generatedInsight.headline,
      significanceScore: generatedInsight.significanceScore,
      keySignal: generatedInsight.keySignal,
      coreFunctions: context.functionBreakdown,
      functionChanges,
      hiringTrends: insightData.hiring_trends,
      newDirections: generatedInsight.newDirections,
      isPublicCompany: companyType.isPublic,
      statedStrategy: research.statedStrategy,
      financialContext: research.financialContext,
      analystReports: [],
      researchSources: research.sources,
      researchQualityScore: research.qualityScore,
      alignmentAnalysis: generatedInsight.alignmentAnalysis,
      discrepancies: generatedInsight.discrepancies,
      strategicImplications: generatedInsight.strategicImplications,
      modelReasoning: generatedInsight.modelReasoning,
      researchDepth,
      previousInsightId: previousInsight?.id || null,
      generationCostEstimate: totalCost,
    };
  } catch (error) {
    // Always release lock on error
    if (lockAcquired) {
      await supabase
        .from("insight_generation_locks")
        .delete()
        .eq("company_id", companyId);
    }
    throw error;
  }
}

// ============================================================================
// LLM Insight Generation
// ============================================================================

interface GeneratedInsightContent {
  executiveSummary: string;
  strategicHypothesis: string;
  confidence: "high" | "medium" | "low";
  newDirections: string[];
  alignmentAnalysis: string;
  discrepancies: Discrepancy[];
  strategicImplications: string;
  modelReasoning: string;
  // Display fields for dashboard highlights
  headline: string;          // Plain 6–12 word headline, no emoji
  significanceScore: number; // 1-10 ranking
  keySignal: string;         // One-liner explaining strategic signal
}

const COMPANY_INSIGHT_PROMPT = `{voice_block}

You are a fintech strategy analyst. Produce an evidence-backed company insight from hiring signals and external research. Obey the VOICE rules above for every user-visible string.

{hiring_context}

{research_context}

{previous_insight_context}

## Evidence Rules
- Preserve exact named systems, products, vendors, and partnerships when they appear in the evidence.
- Do not downgrade precise names into generic phrases. If the evidence says "Engine by Starling", keep that exact name.
- Distinguish three things clearly in your reasoning: direct hiring evidence, public research evidence, and strategic inference.
- If the evidence is weak, mixed, or ambiguous, say so explicitly.
- Only call something a new direction if the current evidence materially differs from the previous insight or the previous hiring pattern.
- Avoid empty strategy language such as "focuses on innovation" unless it is immediately tied to a concrete named initiative, platform, or hiring signal.

## Analysis Tasks

1. **Headline** (dashboard display):
   - 6–12 words, plain and specific; no emoji or exclamation marks
   - Name the strategic signal (role cluster, function shift, or platform bet), not generic "Company is hiring"

2. **Key Signal** (one-liner):
   - What the headline means strategically; anchor in named evidence when available
   - Example: "Consumer hiring shifts toward small-business banking and onboarding modernization on Engine by Starling."

3. **Significance Score** (1-10):
   - How noteworthy is this insight for industry observers?
   - Scoring guide:
     * Executive/leadership hires: +3
     * New strategic direction detected: +3
     * >50% hiring increase vs previous period: +2
     * New technology/platform bet: +2
     * Routine hiring with no major shifts: baseline 3-4
   - Score 8-10: Major strategic shift, industry-changing
   - Score 5-7: Notable move worth watching
   - Score 1-4: Routine activity

4. **Executive Summary** (2-3 paragraphs):
   - What do the hiring patterns reveal about this company's priorities?
   - Which named systems, products, or partnerships matter strategically?
   - How do the hiring patterns compare to the stated strategy?
   - What strategic directions can we infer vs directly observe?

5. **Strategic Hypothesis**:
   - What is your best hypothesis about why they're hiring this way?
   - What strategic bet are they making?
   - Explicitly mention the strongest evidence for that hypothesis

6. **Alignment Analysis**:
   - How well do their hiring patterns align with their stated strategy?
   - Where do they match? Where do they diverge?
   - Use direct evidence, not general tone

7. **Discrepancies** (if any):
   - Identify specific areas where hiring doesn't match stated priorities
   - Explain the potential implications

8. **New Directions**:
   - List any new strategic directions evident from hiring patterns
   - Focus on significant shifts from historical patterns or the previous insight
   - Do not include routine hiring activity

9. **Strategic Implications**:
   - What does this mean for competitors?
   - What should industry observers pay attention to?

Respond with JSON:
{
  "headline": "6-12 words, plain and specific",
  "key_signal": "One-line strategic explanation",
  "significance_score": 7,
  "executive_summary": "...",
  "strategic_hypothesis": "...",
  "confidence": "high/medium/low",
  "new_directions": ["direction 1", "direction 2", ...],
  "alignment_analysis": "...",
  "discrepancies": [
    {
      "area": "e.g. Technology Investment",
      "stated_strategy": "what they said",
      "actual_hiring": "what they're doing",
      "implication": "what this might mean",
      "severity": "high/medium/low"
    }
  ],
  "strategic_implications": "...",
  "model_reasoning": "brief explanation of the most important evidence used"
}`;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

function formatPreviousInsightContext(
  previousInsight: {
    headline: string | null;
    key_signal: string | null;
    executive_summary: string | null;
  } | null
) {
  if (!previousInsight) {
    return "## Previous Insight Comparison\nNo previous company insight is available. Treat any claimed new direction as tentative unless the current evidence is unusually strong.";
  }

  const sections = ["## Previous Insight Comparison"];

  if (previousInsight.headline) {
    sections.push(`Previous headline: ${previousInsight.headline}`);
  }

  if (previousInsight.key_signal) {
    sections.push(`Previous key signal: ${previousInsight.key_signal}`);
  }

  if (previousInsight.executive_summary) {
    sections.push(`Previous summary: ${previousInsight.executive_summary.replace(/\s+/g, " ").trim().slice(0, 320)}`);
  }

  return sections.join("\n");
}

async function generateInsightWithLLM(
  companyName: string,
  context: ExtendedHistoricalContext,
  research: ResearchResult,
  _companyType: CompanyType,
  previousInsight: {
    id: string;
    core_functions: FunctionStats[];
    headline: string | null;
    key_signal: string | null;
    executive_summary: string | null;
  } | null
): Promise<GeneratedInsightContent> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    generationConfig: {
      temperature: 0.25,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });

  const hiringContext = formatExtendedContextForPrompt(context);
  const researchContext = formatResearchForPrompt(research);
  const previousInsightContext = formatPreviousInsightContext(previousInsight);

  const prompt = COMPANY_INSIGHT_PROMPT.replace("{voice_block}", getVoiceDirective("analysis"))
    .replace("{hiring_context}", hiringContext)
    .replace("{research_context}", researchContext)
    .replace("{previous_insight_context}", previousInsightContext);

  try {
    const result = await withTimeout(
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
      COMPANY_INSIGHT_TIMEOUT_MS,
      `Gemini company insight generation for "${companyName}"`
    );

    const text = result.response.text()?.trim() ?? "";

    // Handle empty response
    if (!text || text.length === 0) {
      console.warn(`Empty response from Gemini for company insight generation: ${companyName}`);
      throw new Error("Empty response from LLM");
    }

    let parsed: Record<string, unknown> | null = null;

    // Try to parse JSON, with fallback for malformed JSON
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch (parseError) {
      // Log the actual response for debugging (first 200 chars)
      const responsePreview = text.length > 200 ? text.substring(0, 200) + "..." : text;
      console.warn(`JSON parse failed for company insight "${companyName}". Response preview: ${responsePreview}`);
      
      // Try to extract JSON from text that might have markdown code blocks or extra text
      // First, try to find JSON in markdown code blocks
      const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        try {
          parsed = JSON.parse(codeBlockMatch[1]) as Record<string, unknown>;
          console.log(`Successfully extracted JSON from markdown code block for company insight "${companyName}"`);
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
            console.log(`Successfully parsed JSON after fixing trailing commas for company insight "${companyName}"`);
          } catch (fixError) {
            console.error(`Failed to parse JSON for company insight "${companyName}" after extraction attempts. Error: ${fixError instanceof Error ? fixError.message : String(fixError)}`);
            // Log the problematic JSON snippet for debugging
            if (jsonMatch[0].length < 500) {
              console.error(`Problematic JSON snippet: ${jsonMatch[0]}`);
            }
            // Log full response if it's short enough to be useful
            if (text.length < 1000) {
              console.error(`Full response: ${text}`);
            }
            throw new Error(`Failed to parse JSON response: ${fixError instanceof Error ? fixError.message : String(fixError)}`);
          }
        } else {
          console.error(`No JSON found in response for company insight "${companyName}". Response length: ${text.length}, Preview: ${responsePreview}`);
          // Log full response if it's short enough to be useful
          if (text.length < 1000) {
            console.error(`Full response: ${text}`);
          }
          throw new Error("No JSON found in LLM response");
        }
      }
    }

    if (!parsed) {
      throw new Error("Failed to parse LLM response");
    }

    const out = {
      executiveSummary: String(parsed.executive_summary || ""),
      strategicHypothesis: String(parsed.strategic_hypothesis || ""),
      confidence: validateConfidence(parsed.confidence),
      newDirections: Array.isArray(parsed.new_directions) ? parsed.new_directions : [],
      alignmentAnalysis: String(parsed.alignment_analysis || ""),
      discrepancies: parseDiscrepancies(parsed.discrepancies),
      strategicImplications: String(parsed.strategic_implications || ""),
      modelReasoning: String(parsed.model_reasoning || ""),
      // Display fields for dashboard highlights
      headline: String(parsed.headline || `Company insight: ${companyName}`),
      significanceScore: validateSignificanceScore(parsed.significance_score),
      keySignal: String(parsed.key_signal || ""),
    };

    const voice = checkVoice({
      headline: out.headline,
      key_signal: out.keySignal,
      executive_summary: out.executiveSummary,
    });
    if (!voice.passed) {
      console.warn(
        `[voice] company insight warnings for ${companyName}:`,
        voice.warnings.join("; ")
      );
    }

    return out;
  } catch (error) {
    console.error("LLM generation error:", error);
    throw new Error(`Failed to generate insight with LLM: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate significance score is within valid range (1-10)
 */
function validateSignificanceScore(value: unknown): number {
  const num = typeof value === "number" ? value : parseInt(String(value), 10);
  if (isNaN(num) || num < 1) return 5; // Default to neutral
  if (num > 10) return 10;
  return Math.round(num);
}

function validateConfidence(value: unknown): "high" | "medium" | "low" {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "medium";
}

function parseDiscrepancies(value: unknown): Discrepancy[] {
  if (!Array.isArray(value)) return [];
  
  return value
    .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
    .map((d) => ({
      area: String(d.area || ""),
      statedStrategy: String(d.stated_strategy || ""),
      actualHiring: String(d.actual_hiring || ""),
      implication: String(d.implication || ""),
      severity: validateSeverity(d.severity),
    }));
}

function validateSeverity(value: unknown): "high" | "medium" | "low" {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "medium";
}

// ============================================================================
// Function Change Calculation
// ============================================================================

function calculateFunctionChanges(
  current: FunctionStats[],
  previous: FunctionStats[]
): FunctionChange[] {
  const previousMap = new Map(previous.map((f) => [f.category, f.count]));
  const changes: FunctionChange[] = [];

  // Check current functions
  for (const func of current) {
    const prevCount = previousMap.get(func.category) || 0;
    const currentCount = func.count;
    const changePercent =
      prevCount > 0
        ? Math.round(((currentCount - prevCount) / prevCount) * 100)
        : currentCount > 0
          ? 100
          : 0;

    let trend: FunctionChange["trend"];
    if (prevCount === 0 && currentCount > 0) {
      trend = "new";
    } else if (changePercent > 25) {
      trend = "increased";
    } else if (changePercent < -25) {
      trend = "decreased";
    } else {
      trend = "stable";
    }

    changes.push({
      category: func.category,
      label: func.label,
      previousCount: prevCount,
      currentCount,
      changePercent,
      trend,
    });
  }

  // Check for eliminated functions
  for (const func of previous) {
    if (!current.find((c) => c.category === func.category)) {
      changes.push({
        category: func.category,
        label: func.label,
        previousCount: func.count,
        currentCount: 0,
        changePercent: -100,
        trend: "eliminated",
      });
    }
  }

  return changes.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the next company that needs insight generation
 * 
 * Uses a 90-day threshold: only regenerates insights for companies
 * whose most recent insight is older than 90 days.
 */
export async function getNextCompanyForInsight(): Promise<{
  id: string;
  name: string;
} | null> {
  const supabase = createAdminClient();
  
  // Insights are refreshed every 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Clean up expired locks first
  const { error: cleanupError } = await supabase.rpc("cleanup_expired_insight_locks");
  if (cleanupError && !isMissingInsightLockInfrastructure(cleanupError)) {
    throw new Error(`Failed to clean up insight locks: ${cleanupError.message}`);
  }

  // Get active companies that don't have a recent insight
  // Exclude companies that are currently being processed (have active locks)
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name")
    .eq("is_active", true);

  if (!companies || companies.length === 0) {
    return null;
  }

  // Get active locks to exclude locked companies
  let activeLocks: Array<{ company_id: string }> | null = [];
  const { data: lockData, error: lockError } = await supabase
    .from("insight_generation_locks")
    .select("company_id")
    .gt("expires_at", new Date().toISOString());

  if (lockError) {
    if (!isMissingInsightLockInfrastructure(lockError)) {
      throw new Error(`Failed to load insight locks: ${lockError.message}`);
    }
    activeLocks = [];
  } else {
    activeLocks = lockData;
  }

  const lockedCompanyIds = new Set((activeLocks ?? []).map((lock) => lock.company_id));

  // Check each company for recent insights (within 90 days) and active locks
  for (const company of companies) {
    // Skip if company is currently being processed
    if (lockedCompanyIds.has(company.id)) {
      continue;
    }

    const { data: recentInsight } = await supabase
      .from("company_insights")
      .select("id")
      .eq("company_id", company.id)
      .gte("generated_at", ninetyDaysAgo.toISOString())
      .limit(1)
      .single();

    if (!recentInsight) {
      return company;
    }
  }

  return null; // All companies have recent insights (within 90 days) or are being processed
}

/**
 * Get existing insight by ID
 */
export async function getCompanyInsight(insightId: string): Promise<CompanyInsight | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("company_insights")
    .select("*")
    .eq("id", insightId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapDatabaseInsightToCompanyInsight(data);
}

/**
 * Get insights for a company
 */
export async function getCompanyInsights(
  companyId: string,
  options: { limit?: number; since?: Date } = {}
): Promise<CompanyInsight[]> {
  const supabase = createAdminClient();
  const limit = options.limit ?? 10;

  let query = supabase
    .from("company_insights")
    .select("*")
    .eq("company_id", companyId)
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (options.since) {
    query = query.gte("generated_at", options.since.toISOString());
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data.map(mapDatabaseInsightToCompanyInsight);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDatabaseInsightToCompanyInsight(data: any): CompanyInsight {
  return {
    id: data.id,
    companyId: data.company_id,
    analysisPeriodStart: new Date(data.analysis_period_start),
    analysisPeriodEnd: new Date(data.analysis_period_end),
    generatedAt: new Date(data.generated_at),
    executiveSummary: data.executive_summary,
    strategicHypothesis: data.strategic_hypothesis,
    confidence: data.confidence,
    // Display fields for dashboard highlights
    headline: data.headline || null,
    significanceScore: data.significance_score || null,
    keySignal: data.key_signal || null,
    coreFunctions: data.core_functions || [],
    functionChanges: data.function_changes || [],
    hiringTrends: data.hiring_trends || {},
    newDirections: data.new_directions || [],
    isPublicCompany: data.is_public_company,
    statedStrategy: data.stated_strategy,
    financialContext: data.financial_context,
    analystReports: data.analyst_reports || [],
    researchSources: data.research_sources || [],
    researchQualityScore: data.research_quality_score,
    alignmentAnalysis: data.alignment_analysis,
    discrepancies: data.discrepancies || [],
    strategicImplications: data.strategic_implications,
    modelReasoning: data.model_reasoning,
    researchDepth: data.research_depth,
    previousInsightId: data.previous_insight_id,
    generationCostEstimate: data.generation_cost_estimate,
  };
}
