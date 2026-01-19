import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * GET /api/cron/cleanup-jobs
 * Cleanup stale jobs that have been running for too long (30+ minutes)
 * Should be called every 15 minutes via Vercel cron
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes ago

  // Find stale tasks (running for more than 30 minutes)
  const { data: staleTasks, error: tasksError } = await supabase
    .from("job_run_tasks")
    .select("id, job_run_id, company_id, started_at")
    .eq("status", "running")
    .lt("started_at", staleThreshold.toISOString());

  if (tasksError) {
    console.error("Error fetching stale tasks:", tasksError);
    return NextResponse.json(
      { error: "Failed to fetch stale tasks", details: tasksError.message },
      { status: 500 }
    );
  }

  if (!staleTasks || staleTasks.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No stale tasks found",
      cleaned: 0,
    });
  }

  const taskIds = staleTasks.map((t) => t.id);
  const jobRunIds = [...new Set(staleTasks.map((t) => t.job_run_id))];

  // Mark stale tasks as failed
  const { error: updateTasksError } = await supabase
    .from("job_run_tasks")
    .update({
      status: "failed",
      error_message: "Job timed out (running for more than 30 minutes)",
      error_stage: "timeout",
      completed_at: now.toISOString(),
    })
    .in("id", taskIds);

  if (updateTasksError) {
    console.error("Error updating stale tasks:", updateTasksError);
    return NextResponse.json(
      { error: "Failed to update stale tasks", details: updateTasksError.message },
      { status: 500 }
    );
  }

  // Find job runs that are still running but all their tasks are now failed
  const { data: jobRuns, error: jobRunsError } = await supabase
    .from("job_runs")
    .select("id")
    .eq("status", "running")
    .in("id", jobRunIds);

  if (jobRunsError) {
    console.error("Error fetching job runs:", jobRunsError);
  } else if (jobRuns && jobRuns.length > 0) {
    // Check each job run to see if all tasks are failed
    for (const jobRun of jobRuns) {
      const { data: tasks } = await supabase
        .from("job_run_tasks")
        .select("status")
        .eq("job_run_id", jobRun.id);

      if (tasks) {
        const allFailed = tasks.every((t) => t.status === "failed");
        const hasRunning = tasks.some((t) => t.status === "running");

        if (allFailed && !hasRunning) {
          // All tasks failed, mark job run as failed
          await supabase
            .from("job_runs")
            .update({
              status: "failed",
              error_message: "All tasks timed out",
              completed_at: now.toISOString(),
            })
            .eq("id", jobRun.id);
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: `Cleaned up ${staleTasks.length} stale task(s)`,
    cleaned: staleTasks.length,
    taskIds,
  });
}
