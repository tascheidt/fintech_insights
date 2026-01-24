import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateCompanyInsight,
  getNextCompanyForInsight,
} from "@/lib/analysis/company-insights";

export const maxDuration = 300; // 5 minutes max

/**
 * GET /api/cron/company-insights
 * Weekly cron job to generate company insights
 * 
 * Processes one company at a time to avoid timeouts.
 * Should be called multiple times if there are many companies.
 * 
 * Uses job_runs table for unified job tracking (not cron_logs).
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const startTime = Date.now();

  // Check if a specific company was requested
  const companyId = req.nextUrl.searchParams.get("companyId");

  // Create job_runs entry for tracking (unified job tracking system)
  const { data: jobRun } = await supabase
    .from("job_runs")
    .insert({
      job_type: "company-insights",
      trigger_type: "cron",
      scope: companyId ? "single" : "all",
      company_id: companyId || null,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  const jobRunId = jobRun?.id;

  try {
    let company: { id: string; name: string } | null = null;

    if (companyId) {
      // Process specific company
      const { data } = await supabase
        .from("companies")
        .select("id, name")
        .eq("id", companyId)
        .eq("is_active", true)
        .single();
      company = data;
    } else {
      // Get next company that needs an insight
      company = await getNextCompanyForInsight();
    }

    if (!company) {
      // Update job_runs with completion (no companies needed processing)
      if (jobRunId) {
        await supabase
          .from("job_runs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            total_companies: 0,
            total_insights: 0,
            details: {
              message: "All companies have recent insights",
              triggerType: "cron",
            },
          })
          .eq("id", jobRunId);
      }

      return NextResponse.json({
        success: true,
        message: "All companies have recent insights",
        processed: 0,
      });
    }

    console.log(`Generating insight for ${company.name}...`);

    // Generate the insight
    const insight = await generateCompanyInsight(company.id, company.name, {
      periodDays: 90,
      researchDepth: "deep",
      forceRegenerate: false,
    });

    const duration = Date.now() - startTime;

    // Update job_runs with success (unified job tracking)
    if (jobRunId) {
      await supabase
        .from("job_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          company_id: company.id,
          total_companies: 1,
          total_insights: 1,
          details: {
            companyId: company.id,
            companyName: company.name,
            insightId: insight.id,
            triggerType: "cron",
            duration,
            estimatedCost: insight.generationCostEstimate,
            researchQualityScore: insight.researchQualityScore,
          },
        })
        .eq("id", jobRunId);
    }

    // Check if there are more companies to process
    const nextCompany = await getNextCompanyForInsight();
    const hasMore = nextCompany !== null;

    return NextResponse.json({
      success: true,
      companyId: company.id,
      companyName: company.name,
      insightId: insight.id,
      duration,
      hasMore,
      nextCompanyId: nextCompany?.id,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Company insights cron error:", error);

    // Update job_runs with failure (unified job tracking)
    if (jobRunId) {
      await supabase
        .from("job_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: errorMessage,
          details: {
            companyId: companyId || null,
            triggerType: "cron",
            duration: Date.now() - startTime,
          },
        })
        .eq("id", jobRunId);
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
