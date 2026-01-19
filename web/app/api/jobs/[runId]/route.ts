import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/jobs/[runId]
 * Get job run status with all tasks
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const supabase = await createClient();

    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get job run with tasks
    const { data: jobRun, error } = await supabase
      .from("job_runs")
      .select(`
        *,
        tasks:job_run_tasks(*),
        analysis_job:job_runs!parent_job_run_id(*)
      `)
      .eq("id", runId)
      .single();

    if (error || !jobRun) {
      return NextResponse.json({ error: "Job run not found" }, { status: 404 });
    }

    return NextResponse.json(jobRun);
  } catch (error) {
    console.error("Get job run error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
