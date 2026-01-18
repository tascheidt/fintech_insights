import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Strategic Analysis using Gemini 3 Flash
 * 
 * Uses JSON mode for guaranteed structured output.
 * Leverages Gemini 3's enhanced reasoning capabilities.
 */

const PROMPT = `You are a competitive intelligence analyst specializing in the fintech industry.
Analyze the following job posting and identify strategic signals that reveal company strategy.

Company: {company_name}
Job Title: {job_title}
Department: {department}
Location: {location}

Job Description:
{description}

Analyze this posting for strategic intelligence. Consider:
- New market entry signals (hiring in new locations, new language requirements)
- Product development indicators (specific domain expertise, new tech stacks)
- Scaling signals (multiple similar roles, operations/support hiring)
- Regulatory preparation (compliance, legal, risk roles)
- Technology shifts (new languages, platforms, cloud providers)
- Customer focus changes (CX, support, success roles)
- Data/AI capabilities (analytics, ML/AI, data engineering)
- Go-to-market changes (marketing, sales, partnerships)
- Leadership changes (executive hires, new functions)

Respond with a JSON object containing:
{
  "category": "one of: expansion, new-product, technology, operational, compliance, customer, data, marketing, leadership, other",
  "insight_summary": "2-3 sentence summary of what this hire signals about company strategy",
  "strategic_signals": ["signal 1", "signal 2", "signal 3"],
  "is_new_direction": true or false,
  "confidence": "high, medium, or low",
  "reasoning": "brief explanation of your reasoning"
}`;

export interface AnalyzeResult {
  category: string;
  insight_summary: string;
  strategic_signals: string[];
  is_new_direction: boolean;
  confidence: string;
  reasoning?: string;
}

export async function analyzeJob(
  companyName: string,
  job: { title: string; department?: string | null; location?: string | null; description_text?: string | null }
): Promise<AnalyzeResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("GEMINI_API_KEY not configured");
    return null;
  }

  const prompt = PROMPT.replace("{company_name}", companyName)
    .replace("{job_title}", job.title)
    .replace("{department}", job.department ?? "Not specified")
    .replace("{location}", job.location ?? "Not specified")
    .replace("{description}", (job.description_text ?? "").slice(0, 8000) || "No description available");

  try {
    const genAI = new GoogleGenerativeAI(key);
    
    // Use Gemini 3 Flash with JSON mode for guaranteed structured output
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response.text()?.trim() ?? "{}";
    const parsed = JSON.parse(text) as Record<string, unknown>;

    return {
      category: String(parsed.category ?? "other"),
      insight_summary: String(parsed.insight_summary ?? ""),
      strategic_signals: Array.isArray(parsed.strategic_signals) 
        ? (parsed.strategic_signals as string[]) 
        : [],
      is_new_direction: Boolean(parsed.is_new_direction),
      confidence: String(parsed.confidence ?? "medium"),
      reasoning: parsed.reasoning ? String(parsed.reasoning) : undefined,
    };
  } catch (error) {
    console.error("Gemini analysis error:", error);
    return null;
  }
}
