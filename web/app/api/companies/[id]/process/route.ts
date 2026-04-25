import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createJobRun, executeCollectionJob, triggerAnalysisJobIfNeeded } from "@/lib/jobs";
import { requireUser } from "@/lib/auth/guards";
import { log } from "@/lib/log";

export const maxDuration = 120;

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * POST /api/companies/[id]/process
 * Manually trigger job collection and analysis for a specific company
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const paramsParsed = paramsSchema.safeParse(await params);
    if (!paramsParsed.success) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const { id } = paramsParsed.data;

    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const { user, supabase } = auth;
    const adminSupabase = createAdminClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!["editor", "admin"].includes(profile?.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get the company
    const { data: company, error: companyError } = await adminSupabase
      .from("companies")
      .select("*")
      .eq("id", id)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (!company.is_active) {
      return NextResponse.json({ error: "Company is not active" }, { status: 400 });
    }

    // Check for existing running job for this company (deduplication)
    const { data: existingRunningTask } = await adminSupabase
      .from("job_run_tasks")
      .select("job_run_id, status")
      .eq("company_id", id)
      .eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

    if (existingRunningTask) {
      // Return existing job run ID (idempotent)
      return NextResponse.json({
        jobRunId: existingRunningTask.job_run_id,
        status: 'already_running',
        message: 'A job is already running for this company',
      });
    }

    // Phase 1: Collection (fires immediately)
    const jobRunId = await createJobRun({
      jobType: 'collect',
      triggerType: 'manual',
      triggeredBy: user.id,
      companyIds: [id],
    });

    // Fire and forget - return immediately, process in background
    // Use proper error handling to ensure jobs are marked as failed on error
    (async () => {
      try {
        await executeCollectionJob(jobRunId);
        await triggerAnalysisJobIfNeeded(jobRunId); // Auto-trigger Phase 2
      } catch (error) {
        log.error({ err: error, jobRunId }, "Background processing error");

        // Mark job run as failed
        const errorMessage = error instanceof Error ? error.message : String(error);
        await adminSupabase
          .from("job_runs")
          .update({
            status: "failed",
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
          })
          .eq("id", jobRunId);

        // Mark all tasks in this job run as failed
        await adminSupabase
          .from("job_run_tasks")
          .update({
            status: "failed",
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
          })
          .eq("job_run_id", jobRunId)
          .eq("status", "running");
      }
    })();

    return NextResponse.json({ jobRunId, status: 'started' });
  } catch (error) {
    log.error({ err: error }, "Process company error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
