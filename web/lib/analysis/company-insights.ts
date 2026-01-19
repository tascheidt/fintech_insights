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

  // Step 1: Check for recent insight (rate limiting)
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
  let previousInsight: { id: string; core_functions: FunctionStats[] } | null = null;
  if (compareToPrevious) {
    const { data } = await supabase
      .from("company_insights")
      .select("id, core_functions")
      .eq("company_id", companyId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .single();
    
    previousInsight = data as typeof previousInsight;
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

  return {
    id: inserted.id,
    companyId,
    analysisPeriodStart: context.periodStart,
    analysisPeriodEnd: context.periodEnd,
    generatedAt: now,
    executiveSummary: generatedInsight.executiveSummary,
    strategicHypothesis: generatedInsight.strategicHypothesis,
    confidence: generatedInsight.confidence,
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
}

const COMPANY_INSIGHT_PROMPT = `You are an elite competitive intelligence analyst specializing in fintech. Analyze this company's hiring patterns and compare them to their publicly stated strategy.

{hiring_context}

{research_context}

## Analysis Tasks

1. **Executive Summary** (2-3 paragraphs):
   - What do the hiring patterns reveal about this company's priorities?
   - How do they compare to their stated strategy?
   - What strategic directions can we infer?

2. **Strategic Hypothesis**:
   - What is your best hypothesis about why they're hiring this way?
   - What strategic bet are they making?

3. **Alignment Analysis**:
   - How well do their hiring patterns align with their stated strategy?
   - Where do they match? Where do they diverge?

4. **Discrepancies** (if any):
   - Identify specific areas where hiring doesn't match stated priorities
   - Explain the potential implications

5. **New Directions**:
   - List any new strategic directions evident from hiring patterns
   - Focus on significant shifts from historical patterns

6. **Strategic Implications**:
   - What does this mean for competitors?
   - What should industry observers pay attention to?

Respond with JSON:
{
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
  "model_reasoning": "your reasoning process"
}`;

async function generateInsightWithLLM(
  companyName: string,
  context: ExtendedHistoricalContext,
  research: ResearchResult,
  companyType: CompanyType,
  previousInsight: { id: string; core_functions: FunctionStats[] } | null
): Promise<GeneratedInsightContent> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });

  const hiringContext = formatExtendedContextForPrompt(context);
  const researchContext = formatResearchForPrompt(research);

  const prompt = COMPANY_INSIGHT_PROMPT
    .replace("{hiring_context}", hiringContext)
    .replace("{research_context}", researchContext);

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response.text()?.trim() ?? "{}";
    const parsed = JSON.parse(text);

    return {
      executiveSummary: String(parsed.executive_summary || ""),
      strategicHypothesis: String(parsed.strategic_hypothesis || ""),
      confidence: validateConfidence(parsed.confidence),
      newDirections: Array.isArray(parsed.new_directions) ? parsed.new_directions : [],
      alignmentAnalysis: String(parsed.alignment_analysis || ""),
      discrepancies: parseDiscrepancies(parsed.discrepancies),
      strategicImplications: String(parsed.strategic_implications || ""),
      modelReasoning: String(parsed.model_reasoning || ""),
    };
  } catch (error) {
    console.error("LLM generation error:", error);
    throw new Error("Failed to generate insight with LLM");
  }
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
 */
export async function getNextCompanyForInsight(): Promise<{
  id: string;
  name: string;
} | null> {
  const supabase = createAdminClient();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Get companies with track_for_strategy = true that don't have a recent insight
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name")
    .eq("track_for_strategy", true)
    .eq("is_active", true);

  if (!companies || companies.length === 0) {
    return null;
  }

  // Check each company for recent insights
  for (const company of companies) {
    const { data: recentInsight } = await supabase
      .from("company_insights")
      .select("id")
      .eq("company_id", company.id)
      .gte("generated_at", sevenDaysAgo.toISOString())
      .limit(1)
      .single();

    if (!recentInsight) {
      return company;
    }
  }

  return null; // All companies have recent insights
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
