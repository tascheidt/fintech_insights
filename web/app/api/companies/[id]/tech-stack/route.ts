import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { aggregateTechStackFromJobs } from "@/lib/ai/tech-stack-aggregation";
import { enrichTechStackWithAnalysis, type CompanyTechStack } from "@/lib/ai/tech-stack-extraction";
import { getActiveTechStackAiConfig } from "@/lib/ai/prompt-config";
import { buildTechStackStrategicContext } from "@/lib/analysis/strategic-context";
import { requireUser } from "@/lib/auth/guards";
import { log } from "@/lib/log";

export const maxDuration = 120;

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * GET /api/companies/[id]/tech-stack
 * Retrieve cached tech stack for a company
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const paramsParsed = paramsSchema.safeParse(await params);
  if (!paramsParsed.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const { id } = paramsParsed.data;

  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const { data: company } = await supabase
    .from("companies")
    .select("id, tech_stack, tech_stack_generated_at")
    .eq("id", id)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  return NextResponse.json({
    techStack: company.tech_stack as CompanyTechStack | null,
    generatedAt: company.tech_stack_generated_at,
  });
}

/**
 * POST /api/companies/[id]/tech-stack
 * Generate/refresh tech stack using hybrid pipeline (DB aggregate + Gemini Pro enrichment)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const paramsParsed = paramsSchema.safeParse(await params);
  if (!paramsParsed.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const { id } = paramsParsed.data;

  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  // Verify access via RLS (user can see the company)
  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", id)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // Rate limit: once per 24 hours
  const adminSupabase = createAdminClient();
  const { data: existing } = await adminSupabase
    .from("companies")
    .select("tech_stack_generated_at")
    .eq("id", id)
    .single();

  if (existing?.tech_stack_generated_at) {
    const lastGen = new Date(existing.tech_stack_generated_at).getTime();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    if (lastGen > oneDayAgo) {
      return NextResponse.json(
        { error: "Tech stack was generated recently. Try again tomorrow." },
        { status: 429 }
      );
    }
  }

  try {
    // Step 1: DB aggregation (instant, no AI)
    const rawData = await aggregateTechStackFromJobs(id);
    const config = await getActiveTechStackAiConfig();
    const strategicContext = await buildTechStackStrategicContext(id);

    if (rawData.technologies.length === 0) {
      return NextResponse.json(
        { error: "No tech stack data found in job postings for this company" },
        { status: 404 }
      );
    }

    // Step 2: Gemini Pro enrichment (categorizes + adds narrative summaries)
    const enrichedStack = await enrichTechStackWithAnalysis(
      company.name,
      rawData.technologies,
      rawData.totalJobsAnalyzed,
      rawData.periodStart,
      rawData.periodEnd,
      strategicContext.context,
      config
    );

    // Store the result
    await adminSupabase
      .from("companies")
      .update({
        tech_stack: enrichedStack,
        tech_stack_generated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ techStack: enrichedStack }, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Tech stack generation error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate tech stack" },
      { status: 500 }
    );
  }
}
