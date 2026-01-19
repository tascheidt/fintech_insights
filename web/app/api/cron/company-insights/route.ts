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
      // Log completion
      await supabase.from("cron_logs").insert({
        job_type: "company-insights",
        status: "success",
        details: {
          message: "All companies have recent insights",
          triggerType: "cron",
        },
      });

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

    // Log success
    await supabase.from("cron_logs").insert({
      job_type: "company-insights",
      status: "success",
      details: {
        companyId: company.id,
        companyName: company.name,
        insightId: insight.id,
        triggerType: "cron",
        duration,
        estimatedCost: insight.generationCostEstimate,
        researchQualityScore: insight.researchQualityScore,
      },
    });

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

    // Log failure
    await supabase.from("cron_logs").insert({
      job_type: "company-insights",
      status: "error",
      error_message: errorMessage,
      details: {
        companyId: companyId || null,
        triggerType: "cron",
        duration: Date.now() - startTime,
      },
    });

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
