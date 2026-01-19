import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createJobRun, executeCollectionJob, triggerAnalysisJobIfNeeded } from "@/lib/jobs";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  return NextResponse.json({
    success: true,
    jobRunId,
    ...result.stats,
  });
}
