import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { generatePosting } from "@/lib/analysis/posting-generator";

const MAX_JOBS = 5;

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

  if (!process.env.GEMINI_API_KEY) {
    log.error("GEMINI_API_KEY is not configured");
    return NextResponse.json(
      { error: "AI service not configured" },
      { status: 500 }
    );
  }

  try {
    const posting = await generatePosting(jobs, {
      companyName,
      seniority,
      tone,
      additionalNotes,
    });
    return NextResponse.json({ posting });
  } catch (err) {
    log.error({ err }, "Gemini generate-posting call failed");

    return NextResponse.json(
      { error: "Failed to generate posting" },
      { status: 500 }
    );
  }
}
