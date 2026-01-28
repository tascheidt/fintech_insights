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

  const supabase = createAdminClient();

  // Get all active companies
  const { data: companies } = await supabase
    .from("companies")
    .select("id")
    .eq("is_active", true);

  if (!companies || companies.length === 0) {
    return NextResponse.json({ success: true, message: "No active companies to process" });
  }

  // Phase 1: Collection
  const jobRunId = await createJobRun({
    jobType: 'collect',
    triggerType: 'cron',
    companyIds: companies.map(c => c.id),
  });

  const result = await executeCollectionJob(jobRunId);

  // Phase 2: Analysis (auto-triggered if there are new jobs to analyze)
  await triggerAnalysisJobIfNeeded(jobRunId);

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
