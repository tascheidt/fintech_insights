import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import {
  generateCompanyInsight,
  getCompanyInsights,
} from "@/lib/analysis/company-insights";
import { requireUser } from "@/lib/auth/guards";
import { log } from "@/lib/log";

export const maxDuration = 120; // 2 minutes for on-demand generation

const paramsSchema = z.object({ id: z.string().uuid() });

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  since: z.string().datetime().optional(),
  includeResearch: z.enum(["true", "false"]).optional(),
});

const generateSchema = z.object({
  periodDays: z.number().min(30).max(180).optional(),
  researchDepth: z.enum(["basic", "deep"]).optional(),
  force: z.boolean().optional(),
});

/**
 * GET /api/companies/[id]/insights
 * List all insights for a company
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

  // Verify user has access to this company
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", id)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // Parse query params
  const queryParsed = querySchema.safeParse({
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    since: req.nextUrl.searchParams.get("since") ?? undefined,
    includeResearch: req.nextUrl.searchParams.get("includeResearch") ?? undefined,
  });
  if (!queryParsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: queryParsed.error.issues },
      { status: 400 }
    );
  }
  const { limit, since } = queryParsed.data;
  const includeResearch = queryParsed.data.includeResearch === "true";

  try {
    const insights = await getCompanyInsights(id, {
      limit,
      since: since ? new Date(since) : undefined,
    });

    // Optionally strip research details for performance
    const response = insights.map((insight) => {
      if (!includeResearch) {
        return {
          ...insight,
          researchSources: [], // Don't include full sources in list view
          modelReasoning: undefined, // Don't include reasoning in list view
        };
      }
      return insight;
    });

    return NextResponse.json({ insights: response });
  } catch (error) {
    log.error({ err: error }, "Error fetching company insights");
    return NextResponse.json(
      { error: "Failed to fetch insights" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/companies/[id]/insights
 * Generate a new company insight
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
  const { user, supabase } = auth;

  // Get user profile and role
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Verify user has access to this company
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, organization_id")
    .eq("id", id)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  if (company.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse request body
  let body: unknown;
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { periodDays, researchDepth, force } = parsed.data;

  // Rate limiting: Only admins can force regenerate
  const canForce = profile.role === "admin" && force;

  // Check for recent insight (7-day rate limit for non-admin)
  if (!canForce) {
    const adminSupabase = createAdminClient();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentInsight } = await adminSupabase
      .from("company_insights")
      .select("id, generated_at, executive_summary")
      .eq("company_id", id)
      .gte("generated_at", sevenDaysAgo.toISOString())
      .order("generated_at", { ascending: false })
      .limit(1)
      .single();

    if (recentInsight) {
      return NextResponse.json(
        {
          message: "Recent insight exists",
          insight: recentInsight,
          nextAllowedAt: new Date(
            new Date(recentInsight.generated_at).getTime() + 7 * 24 * 60 * 60 * 1000
          ).toISOString(),
        },
        { status: 200 }
      );
    }
  }

  // Create job_runs entry for tracking (unified job tracking system)
  const adminSupabase = createAdminClient();
  const { data: jobRun } = await adminSupabase
    .from("job_runs")
    .insert({
      job_type: "insight-generation",
      trigger_type: "manual",
      triggered_by: user.id,
      scope: "single",
      company_id: company.id,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  const jobRunId = jobRun?.id;

  try {
    const insight = await generateCompanyInsight(company.id, company.name, {
      periodDays: periodDays ?? 90,
      researchDepth: researchDepth ?? "deep",
      forceRegenerate: canForce,
    });

    // Update job_runs with success (unified job tracking)
    if (jobRunId) {
      await adminSupabase
        .from("job_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          total_companies: 1,
          total_insights: 1,
          details: {
            companyId: company.id,
            companyName: company.name,
            insightId: insight.id,
            triggeredBy: user.id,
            triggerType: "on-demand",
            estimatedCost: insight.generationCostEstimate,
            researchQualityScore: insight.researchQualityScore,
          },
        })
        .eq("id", jobRunId);
    }

    return NextResponse.json({ insight }, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Error generating company insight");

    // Update job_runs with failure (unified job tracking)
    if (jobRunId) {
      await adminSupabase
        .from("job_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : "Unknown error",
          details: {
            companyId: company.id,
            companyName: company.name,
            triggeredBy: user.id,
            triggerType: "on-demand",
          },
        })
        .eq("id", jobRunId);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate insight" },
      { status: 500 }
    );
  }
}
