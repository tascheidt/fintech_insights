import { GoogleGenerativeAI } from "@google/generative-ai";

const PROMPT = `You are a competitive intelligence analyst specializing in the fintech industry.
Analyze the following job posting and identify strategic signals.

Company: {company_name}
Job Title: {job_title}
Department: {department}
Location: {location}
Job Description:
{description}

Based on this job posting, provide analysis in the following JSON format:
{
    "category": "<one of: expansion, new-product, technology, operational, compliance, customer, data, marketing, leadership, other>",
    "insight_summary": "<2-3 sentence summary of what this hire signals about company strategy>",
    "strategic_signals": ["<signal 1>", "<signal 2>", "<signal 3>"],
    "is_new_direction": <true/false - is this a new strategic direction or continuation of existing strategy>,
    "confidence": "<high/medium/low - how confident are you in this analysis>"
}

Strategic signals to look for:
- New market entry (hiring in new locations)
- New product development (specific domain expertise, new tech stacks)
- Scaling operations (multiple similar roles, operations/support)
- Regulatory preparation (compliance, legal, risk roles)
- Technology shifts (new languages, platforms, infrastructure)
- Customer focus (CX, support, success roles)
- Data capabilities (analytics, ML/AI, data engineering)

Respond ONLY with valid JSON, no other text.`;

export interface AnalyzeResult {
  category: string;
  insight_summary: string;
  strategic_signals: string[];
  is_new_direction: boolean;
  confidence: string;
}

export async function analyzeJob(
  companyName: string,
  job: { title: string; department?: string | null; location?: string | null; description_text?: string | null }
): Promise<AnalyzeResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const prompt = PROMPT.replace("{company_name}", companyName)
    .replace("{job_title}", job.title)
    .replace("{department}", job.department ?? "Not specified")
    .replace("{location}", job.location ?? "Not specified")
    .replace("{description}", (job.description_text ?? "").slice(0, 5000) || "No description available");

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
    });
    let text = result.response.text()?.trim() ?? "";
    if (text.startsWith("```")) {
      const lines = text.split("\n");
      text = lines.slice(1, -1).join("\n");
    }
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return {
      category: String(parsed.category ?? "other"),
      insight_summary: String(parsed.insight_summary ?? ""),
      strategic_signals: Array.isArray(parsed.strategic_signals) ? (parsed.strategic_signals as string[]) : [],
      is_new_direction: Boolean(parsed.is_new_direction),
      confidence: String(parsed.confidence ?? "medium"),
    };
  } catch {
    return null;
  }
}
