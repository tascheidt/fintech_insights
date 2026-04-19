import { GoogleGenerativeAI } from "@google/generative-ai";
import { getVoiceDirective } from "@/lib/ai/voice";
import { recordUsage } from "@/lib/ai/gemini-meter";
import { writeUsageEvent } from "@/lib/ai/gemini-telemetry";

/**
 * Strategy Analysis Pipeline
 *
 * Analyzes a company's job postings to infer strategic initiatives,
 * clustering roles into themed groups that reveal company direction.
 */

// ============================================================================
// Types
// ============================================================================

export interface JobPosting {
  id: string;
  title: string;
  department: string | null;
  function_category: string | null;
  location: string | null;
  first_seen_date: string;
  is_active: boolean;
  description_text?: string | null;
}

export interface StrategicInitiative {
  id: string;
  name: string;
  description: string;
  confidence: "high" | "medium" | "low";
  category: string;
  roles: {
    jobId: string;
    title: string;
    relevance: string;
  }[];
  signals: string[];
  timeframe: {
    firstPosting: string;
    lastPosting: string;
    isOngoing: boolean;
  };
}

export interface StructuredAssessment {
  headline: string;
  details: string;
  keyRisk: string;
}

export interface StrategyAnalysisResult {
  companyName: string;
  analyzedAt: string;
  totalJobsAnalyzed: number;
  initiatives: StrategicInitiative[];
  overallAssessment: string | StructuredAssessment;
}

// ============================================================================
// Prompt
// ============================================================================

const STRATEGY_PROMPT_BODY = `{voice_block}

You are a senior competitive intelligence analyst at a fintech-focused investment firm. Your specialty is reverse-engineering corporate strategy from public hiring data. Apply the VOICE rules above to initiative names, descriptions, signals, and overall_assessment text.

Given the following job postings for {company_name}, identify distinct strategic initiatives the company appears to be pursuing. Group related roles together and explain what each cluster reveals about company direction.

IMPORTANT RULES:
- Only identify initiatives with clear evidence from the job data
- Do not hallucinate connections — if roles are standard backfills, say so
- Focus on patterns: multiple related hires, unusual role combinations, new departments
- Consider timing: roles posted close together in a new area signal intentional build-out

JOB POSTINGS (last 12 months):
{job_data}

Respond with a JSON object:
{
  "initiatives": [
    {
      "id": "initiative-1",
      "name": "Short strategic initiative name (e.g., 'Digital Wealth Expansion')",
      "description": "2-3 sentence explanation of what this hiring cluster signals",
      "confidence": "high | medium | low",
      "category": "one of: market-expansion, new-product, technology-investment, regulatory-preparation, operational-scaling, talent-upgrade, cost-optimization, customer-experience, ai-data-capabilities, other",
      "role_ids": ["id1", "id2"],
      "signals": ["Signal 1", "Signal 2"],
      "is_ongoing": true
    }
  ],
  "overall_assessment": {
    "headline": "One-sentence strategic thesis summarizing the company's direction",
    "details": "2-3 sentence supporting analysis expanding on the headline",
    "key_risk": "Primary risk or concern identified from the hiring patterns"
  }
}

Guidelines:
- Aim for 3-7 initiatives (fewer if the company has limited postings)
- Each role should belong to at most one initiative (assign to the best fit)
- Roles that don't fit any initiative can be omitted
- Confidence should be "high" only when 3+ roles clearly support the initiative
- The overall_assessment should synthesize the initiatives into a coherent strategic narrative`;

function buildStrategyPrompt(companyName: string, jobData: string): string {
  return STRATEGY_PROMPT_BODY.replace("{voice_block}", getVoiceDirective("narrative"))
    .replace("{company_name}", companyName)
    .replace("{job_data}", jobData);
}

// ============================================================================
// Helpers
// ============================================================================

function parseAssessment(
  raw: unknown
): string | StructuredAssessment {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.headline === "string") {
      return {
        headline: obj.headline,
        details: String(obj.details ?? ""),
        keyRisk: String(obj.key_risk ?? ""),
      };
    }
  }
  return "Analysis could not be completed.";
}

// ============================================================================
// Analysis Function
// ============================================================================

export async function analyzeCompanyStrategy(
  companyName: string,
  jobs: JobPosting[]
): Promise<StrategyAnalysisResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("GEMINI_API_KEY not configured");
    return null;
  }

  if (jobs.length === 0) {
    return {
      companyName,
      analyzedAt: new Date().toISOString(),
      totalJobsAnalyzed: 0,
      initiatives: [],
      overallAssessment: { headline: "No data available", details: "No job postings available for analysis.", keyRisk: "" },
    };
  }

  // Format job data for the prompt — include key fields, limit description
  const jobData = jobs
    .map(
      (j) =>
        `[ID: ${j.id}] ${j.title} | Dept: ${j.department ?? "N/A"} | Category: ${j.function_category ?? "N/A"} | Location: ${j.location ?? "N/A"} | Posted: ${j.first_seen_date} | Status: ${j.is_active ? "Active" : "Closed"}`
    )
    .join("\n");

  const prompt = buildStrategyPrompt(companyName, jobData);

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    const _startMs = Date.now();
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    writeUsageEvent(
      recordUsage({
        callSite: "analyzeCompanyStrategy",
        modelRequested: "gemini-flash-latest",
        groundingEnabled: false,
        usageMetadata: result.response.usageMetadata,
        latencyMs: Date.now() - _startMs,
        status: "ok",
        extra: { companyName },
      })
    );

    const text = result.response.text()?.trim() ?? "{}";
    const parsed = JSON.parse(text) as Record<string, unknown>;

    // Build a lookup map for jobs
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    // Transform the AI response into typed initiatives
    const rawInitiatives = Array.isArray(parsed.initiatives)
      ? (parsed.initiatives as Record<string, unknown>[])
      : [];

    const initiatives: StrategicInitiative[] = rawInitiatives.map(
      (init, idx) => {
        const roleIds = Array.isArray(init.role_ids)
          ? (init.role_ids as string[])
          : [];

        // Match role IDs to actual jobs
        const roles = roleIds
          .map((id) => {
            const job = jobMap.get(id);
            if (!job) return null;
            return {
              jobId: job.id,
              title: job.title,
              relevance: job.function_category ?? "unknown",
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        // Determine timeframe from matched roles
        const matchedJobs = roleIds
          .map((id) => jobMap.get(id))
          .filter((j): j is JobPosting => j !== undefined);

        const dates = matchedJobs
          .map((j) => j.first_seen_date)
          .sort();

        return {
          id: String(init.id ?? `initiative-${idx + 1}`),
          name: String(init.name ?? "Unknown Initiative"),
          description: String(init.description ?? ""),
          confidence: (["high", "medium", "low"].includes(
            String(init.confidence)
          )
            ? String(init.confidence)
            : "medium") as "high" | "medium" | "low",
          category: String(init.category ?? "other"),
          roles,
          signals: Array.isArray(init.signals)
            ? (init.signals as string[])
            : [],
          timeframe: {
            firstPosting: dates[0] ?? "",
            lastPosting: dates[dates.length - 1] ?? "",
            isOngoing: Boolean(init.is_ongoing),
          },
        };
      }
    );

    return {
      companyName,
      analyzedAt: new Date().toISOString(),
      totalJobsAnalyzed: jobs.length,
      initiatives,
      overallAssessment: parseAssessment(parsed.overall_assessment),
    };
  } catch (error) {
    console.error("Strategy analysis error:", error);
    return null;
  }
}
