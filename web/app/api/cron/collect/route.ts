import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createJobRun, executeCollectionJob, triggerAnalysisJobIfNeeded, refreshNewsCacheForActiveCompanies } from "@/lib/jobs";
import { requireCronAuth } from "@/lib/cron/auth";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Validate cron authentication
  const authError = requireCronAuth(req);
  if (authError) {
    return authError;
  }

  console.log("Cron job started: collect", {
    timestamp: new Date().toISOString(),
    path: req.nextUrl.pathname,
  });

  try {
    const supabase = createAdminClient();

    // Get all active companies
    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select("id, name, ats_type")
      .eq("is_active", true);

    if (companiesError) {
      console.error("Failed to fetch companies:", companiesError.message);
      return NextResponse.json(
        { success: false, error: companiesError.message },
        { status: 500 }
      );
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({ success: true, message: "No active companies to process" });
    }

    console.log(`Processing ${companies.length} companies:`, companies.map(c => `${c.name} (${c.ats_type})`));

    // Phase 1: Collection
    const jobRunId = await createJobRun({
      jobType: 'collect',
      triggerType: 'cron',
      companyIds: companies.map(c => c.id),
    });

    console.log(`Created job run: ${jobRunId}`);

    const result = await executeCollectionJob(jobRunId);

    console.log("Collection completed:", result.stats);

    // Phase 2: Analysis (auto-triggered if there are new jobs to analyze)
    await triggerAnalysisJobIfNeeded(jobRunId);

    return NextResponse.json({
      success: true,
      jobRunId,
      ...result.stats,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Cron collect failed:", errorMessage);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
  // Phase 3: News cache refresh (async, non-blocking)
  // Pre-warms the cache for weekly digest generation
  refreshNewsCacheForActiveCompanies(jobRunId, {
    parallelism: 2,
    skipIfCached: true,
  }).catch((err) => console.error("News cache refresh error:", err));

  return NextResponse.json({
    success: true,
    jobRunId,
    ...result.stats,
  });
}
