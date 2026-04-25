import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { log } from "@/lib/log";

const paramsSchema = z.object({ runId: z.string().uuid() });

/**
 * GET /api/jobs/[runId]
 * Get job run status with all tasks
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const paramsParsed = paramsSchema.safeParse(await params);
    if (!paramsParsed.success) {
      return NextResponse.json({ error: "Invalid runId" }, { status: 400 });
    }
    const { runId } = paramsParsed.data;

    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const { supabase } = auth;

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
    log.error({ err: error }, "Get job run error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
