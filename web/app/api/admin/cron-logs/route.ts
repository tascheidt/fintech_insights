import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  }

  return { supabase };
}

// GET /api/admin/cron-logs - Fetch recent cron execution logs
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return auth.error;
  }
  const { supabase } = auth;

  const searchParams = req.nextUrl.searchParams;
  const jobType = searchParams.get("job_type");
  const operation = searchParams.get("operation");
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);

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

// DELETE /api/admin/cron-logs - Delete a job run
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return auth.error;
  }
  const { supabase } = auth;

  const body = await req.json().catch(() => ({})) as { jobRunId?: string };
  if (!body.jobRunId) {
    return NextResponse.json({ error: "jobRunId is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("job_runs")
    .delete()
    .eq("id", body.jobRunId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
