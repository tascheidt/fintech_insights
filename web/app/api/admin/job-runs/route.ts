import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin";

const querySchema = z.object({
  job_type: z.string().optional(),
  operation: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

const deleteSchema = z.object({
  jobRunId: z.string().uuid(),
});

// GET /api/admin/job-runs - Fetch recent job execution logs
export async function GET(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const queryParsed = querySchema.safeParse({
    job_type: req.nextUrl.searchParams.get("job_type") ?? undefined,
    operation: req.nextUrl.searchParams.get("operation") ?? undefined,
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!queryParsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: queryParsed.error.issues },
      { status: 400 }
    );
  }
  const { job_type: jobType, operation, limit } = queryParsed.data;

  let query = supabase
    .from("job_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (jobType) {
    query = query.eq("job_type", jobType);
  }

  const { data: jobRuns, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const filteredJobRuns = (jobRuns || []).filter((jr) => {
    if (!operation) return true;
    const details = (jr.details as Record<string, unknown> | null) ?? {};
    return details.operation === operation;
  });

  const logs = filteredJobRuns.map((jr) => {
    const details = (jr.details as Record<string, unknown> | null) ?? {};
    return {
      id: jr.id,
      job_type: jr.job_type,
      trigger_type: jr.trigger_type,
      operation: typeof details.operation === "string" ? details.operation : null,
      started_at: jr.started_at,
      completed_at: jr.completed_at,
      status:
        jr.status === "completed"
          ? "success"
          : jr.status === "failed"
            ? "error"
            : jr.status === "pending"
              ? "queued"
              : "running",
      new_jobs_count: jr.total_new_jobs,
      closed_jobs_count: jr.total_closed_jobs,
      insights_generated: jr.total_insights,
      companies_processed: jr.total_companies,
      error_message: jr.error_message,
      details,
    };
  });

  return NextResponse.json({ logs });
}

// DELETE /api/admin/job-runs - Delete a job run
export async function DELETE(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = deleteSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("job_runs")
    .delete()
    .eq("id", parsed.data.jobRunId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
