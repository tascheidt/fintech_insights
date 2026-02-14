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
    // Resume an existing in-flight collect run first to avoid starving tail companies.
    const { data: existingRun } = await supabase
      .from("job_runs")
      .select("id")
      .eq("job_type", "collect")
      .in("status", ["pending", "running"])
      .order("started_at", { ascending: true, nullsFirst: true })
      .limit(1)
      .maybeSingle();

    const jobRunId =
      existingRun?.id ??
      (await createJobRun({
        jobType: "collect",
        triggerType: "cron",
        companyIds: companies.map((c) => c.id),
      }));

    console.log(
      existingRun?.id
        ? `Resuming collect job run: ${jobRunId}`
        : `Created job run: ${jobRunId}`
    );

    const result = await executeCollectionJob(jobRunId);

    console.log("Collection completed:", result.stats);

    // Only trigger follow-on work once all collection tasks are terminal.
    if (result.status === "completed") {
      // Phase 2: Analysis (auto-triggered if there are new jobs to analyze)
      await triggerAnalysisJobIfNeeded(jobRunId);

      // Phase 3: News cache refresh (async, non-blocking)
      // Pre-warms the cache for weekly digest generation
      refreshNewsCacheForActiveCompanies(jobRunId, {
        parallelism: 2,
        skipIfCached: true,
      }).catch((err) => console.error("News cache refresh error:", err));
    } else {
      console.log(
        `Collection job ${jobRunId} still in progress; skipping analysis/news until completion`
      );
    }

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
}
