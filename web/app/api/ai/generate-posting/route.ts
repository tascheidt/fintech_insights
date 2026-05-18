import { NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireUser } from "@/lib/auth/guards";
import { AI_MODEL_OPTIONS } from "@/lib/ai/prompt-config";
import { getVoiceDirective } from "@/lib/ai/voice";
import { recordUsage } from "@/lib/ai/gemini-meter";
import { writeUsageEvent } from "@/lib/ai/gemini-telemetry";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

const MODEL = AI_MODEL_OPTIONS[0].value; // gemini-flash-latest

const MAX_JOBS = 5;
const MAX_DESCRIPTION_CHARS = 3000;

const RequestSchema = z.object({
  jobIds: z.array(z.string().uuid()).min(1).max(MAX_JOBS),
  companyName: z.string().max(200).optional(),
  seniority: z.enum([
    "intern",
    "junior",
    "mid",
    "senior",
    "staff",
    "principal",
    "lead",
    "executive",
  ]),
  tone: z.enum(["professional", "conversational", "startup", "corporate"]),
  additionalNotes: z.string().max(1000).optional(),
});

function buildPrompt(
  jobs: Array<{
    title: string;
    company_name: string;
    description: string;
    seniority_level: string | null;
    tech_stack: string[] | null;
    keywords: string[] | null;
  }>,
  params: {
    companyName?: string;
    seniority: string;
    tone: string;
    additionalNotes?: string;
  }
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

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { jobIds, companyName, seniority, tone, additionalNotes } = parsed.data;

  const adminSupabase = createAdminClient();
  const { data: jobRows, error: dbError } = await adminSupabase
    .from("job_postings")
    .select(
      "id, title, description_text, seniority_level, tech_stack, keywords, company_id"
    )
    .in("id", jobIds);

  if (dbError) {
    log.error({ err: dbError.message }, "Failed to fetch job postings");
    return NextResponse.json(
      { error: "Failed to fetch job data" },
      { status: 500 }
    );
  }

  if (!jobRows || jobRows.length === 0) {
    return NextResponse.json(
      { error: "No matching job postings found" },
      { status: 404 }
    );
  }

  const companyIds = [...new Set(jobRows.map((j) => j.company_id))];
  const { data: companyRows } = await adminSupabase
    .from("companies")
    .select("id, name")
    .in("id", companyIds);

  const companyNameMap = new Map(
    (companyRows ?? []).map((c) => [c.id, c.name])
  );

  const jobs = jobRows.map((j) => ({
    title: j.title,
    company_name: companyNameMap.get(j.company_id) ?? "Unknown",
    description: j.description_text ?? "",
    seniority_level: j.seniority_level as string | null,
    tech_stack: j.tech_stack as string[] | null,
    keywords: j.keywords as string[] | null,
  }));

  const prompt = buildPrompt(jobs, {
    companyName,
    seniority,
    tone,
    additionalNotes,
  });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    log.error("GEMINI_API_KEY is not configured");
    return NextResponse.json(
      { error: "AI service not configured" },
      { status: 500 }
    );
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
      },
    });

    const startMs = Date.now();
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const latencyMs = Date.now() - startMs;

    const posting = result.response.text()?.trim() ?? "";

    writeUsageEvent(
      recordUsage({
        callSite: "generate-posting",
        modelRequested: MODEL,
        groundingEnabled: false,
        usageMetadata: result.response.usageMetadata,
        latencyMs,
        status: "ok",
        extra: {
          jobCount: jobs.length,
          seniority,
          tone,
        },
      })
    );

    return NextResponse.json({ posting });
  } catch (err) {
    log.error({ err }, "Gemini generate-posting call failed");

    writeUsageEvent(
      recordUsage({
        callSite: "generate-posting",
        modelRequested: MODEL,
        groundingEnabled: false,
        usageMetadata: null,
        latencyMs: 0,
        status: "error",
        errorMessage: err instanceof Error ? err.message : "unknown",
      })
    );

    return NextResponse.json(
      { error: "Failed to generate posting" },
      { status: 500 }
    );
  }
}
