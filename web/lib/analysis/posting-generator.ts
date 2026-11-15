/**
 * Job-posting generator (Jobs page → "Generate posting"). User-facing, so the
 * narrative voice directive applies. Extracted from the API route so the model
 * eval suite can drive the exact production prompt and call with fixtures.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { modelFor, withModelProfile } from "@/lib/ai/prompt-config";
import { getVoiceDirective } from "@/lib/ai/voice";
import { recordUsage } from "@/lib/ai/gemini-meter";
import { writeUsageEvent } from "@/lib/ai/gemini-telemetry";

export const MAX_DESCRIPTION_CHARS = 3000;

export interface PostingSourceJob {
  title: string;
  company_name: string;
  description: string;
  seniority_level: string | null;
  tech_stack: string[] | null;
  keywords: string[] | null;
}

export interface PostingParams {
  companyName?: string;
  seniority: string;
  tone: string;
  additionalNotes?: string;
}

export function buildPostingPrompt(
  jobs: PostingSourceJob[],
  params: PostingParams
): string {
  const voiceDirective = getVoiceDirective("narrative");

  const jobSections = jobs
    .map(
      (j, i) =>
        `--- Source Posting ${i + 1} ---
Title: ${j.title}
Company: ${j.company_name}
Seniority: ${j.seniority_level ?? "unknown"}
Tech stack: ${j.tech_stack?.join(", ") || "not specified"}
Key skills: ${j.keywords?.join(", ") || "not specified"}

Description (excerpt):
${j.description.slice(0, MAX_DESCRIPTION_CHARS)}`
    )
    .join("\n\n");

  const toneMap: Record<string, string> = {
    professional:
      "Professional and polished. Clear, concise language suitable for established companies.",
    conversational:
      "Warm and conversational. Approachable language that speaks directly to the candidate.",
    startup:
      "Energetic and mission-driven. Emphasizes impact, growth, and culture without hype.",
    corporate:
      "Formal and structured. Precise language with clear hierarchy of responsibilities.",
  };

  return `${voiceDirective}

You are an expert fintech recruiter and job description writer. Your task is to synthesize the following ${jobs.length} job posting(s) into a single, original job description.

TARGET PARAMETERS:
- Company: ${params.companyName || "Not specified (write generically)"}
- Seniority level: ${params.seniority}
- Tone: ${toneMap[params.tone] || toneMap.professional}
${params.additionalNotes ? `- Additional context: ${params.additionalNotes}` : ""}

SOURCE POSTINGS:
${jobSections}

INSTRUCTIONS:
1. Synthesize common themes, requirements, and responsibilities from the source postings into a cohesive new job description.
2. Adapt the content to match the requested seniority level and tone.
3. Do NOT copy verbatim paragraphs from any single source. Rewrite in your own words.
4. Do NOT invent specific company perks, benefits, salary figures, or policies that are not clearly common across the sources.
5. If the target company name is provided, use it naturally in the posting. Otherwise write generically.
6. Structure the output as:
   - Job title (one line)
   - About the role (2-3 sentences)
   - Responsibilities (bulleted list, 5-8 items)
   - Requirements (bulleted list, 5-8 items)
   - Nice to have (bulleted list, 3-5 items)
   - Tech stack (if applicable, based on source data)

Return ONLY the job posting text. No JSON wrapping, no commentary.`;
}

/** Generate a posting. Throws on API failure (after writing error telemetry). */
export async function generatePosting(
  jobs: PostingSourceJob[],
  params: PostingParams
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const prompt = buildPostingPrompt(jobs, params);
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel(withModelProfile({
      model: modelFor("posting-generator"),
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
      },
    }));

    const startMs = Date.now();
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const latencyMs = Date.now() - startMs;

    const posting = result.response.text()?.trim() ?? "";

    writeUsageEvent(
      recordUsage({
        callSite: "generate-posting",
        modelRequested: modelFor("posting-generator"),
        groundingEnabled: false,
        usageMetadata: result.response.usageMetadata,
        latencyMs,
        status: "ok",
        extra: {
          jobCount: jobs.length,
          seniority: params.seniority,
          tone: params.tone,
        },
      })
    );
    return posting;
  } catch (err) {
    writeUsageEvent(
      recordUsage({
        callSite: "generate-posting",
        modelRequested: modelFor("posting-generator"),
        groundingEnabled: false,
        usageMetadata: null,
        latencyMs: 0,
        status: "error",
        errorMessage: err instanceof Error ? err.message : "unknown",
      })
    );
    throw err;
  }
}
