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

    // Inline cleanup: mark any job_runs/tasks stuck in "running" for >20 min as failed
    const staleThreshold = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: staleTasks } = await supabase
      .from("job_run_tasks")
      .select("id, job_run_id")
      .eq("status", "running")
      .lt("started_at", staleThreshold);

    if (staleTasks && staleTasks.length > 0) {
      await supabase
        .from("job_run_tasks")
        .update({ status: "failed", error_message: "Timed out", completed_at: new Date().toISOString() })
        .in("id", staleTasks.map((t) => t.id));

      // Mark parent job_runs as failed if all their tasks are now failed
      const staleJobRunIds = [...new Set(staleTasks.map((t) => t.job_run_id))];
      for (const runId of staleJobRunIds) {
        const { data: remaining } = await supabase
          .from("job_run_tasks").select("status").eq("job_run_id", runId);
        const allDone = (remaining ?? []).every((t) => t.status !== "running" && t.status !== "pending");
        if (allDone) {
          await supabase
            .from("job_runs")
            .update({ status: "failed", completed_at: new Date().toISOString(), error_message: "Tasks timed out" })
            .eq("id", runId).eq("status", "running");
        }
      }
      console.log(`Cleaned up ${staleTasks.length} stale task(s) before collection run`);
    }

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
    // Resume a recent in-flight collect run (started within last 20 min) to avoid starving
    // tail companies. Older "running" jobs are stale (Vercel killed them) — don't resume.
    const resumeWindow = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: existingRun } = await supabase
      .from("job_runs")
      .select("id")
      .eq("job_type", "collect")
      .in("status", ["pending", "running"])
      .gte("started_at", resumeWindow)
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

    // Only trigger analysis/news once all collection tasks are terminal.
    if (result.status === "completed") {
      // Phase 2: Analysis (auto-triggered if there are new jobs to analyze)
      await triggerAnalysisJobIfNeeded(jobRunId);

      // Phase 3: News cache refresh
      try {
        await refreshNewsCacheForActiveCompanies(jobRunId, {
          parallelism: 2,
          skipIfCached: true,
        });
      } catch (err) {
        console.error("News cache refresh error:", err);
      }
    } else {
      console.log(
        `Collection job ${jobRunId} still in progress; skipping analysis/news until completion`
      );
    }

    // Phase 4: Tech stack refresh — fire off in a separate serverless invocation
    // so it gets its own timeout budget (collection alone can take 4-9 min)
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    fetch(`${baseUrl}/api/internal/tech-stack-refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify({ jobRunId }),
    }).catch((err) => console.error("Failed to trigger tech stack refresh:", err));

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
