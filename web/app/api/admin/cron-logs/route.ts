import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/admin/cron-logs - Fetch recent cron execution logs
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  
  // Check if user is admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
    
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const searchParams = req.nextUrl.searchParams;
  const jobType = searchParams.get("job_type");
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

  // Transform job_runs to match CronLog interface for backward compatibility
  const logs = (jobRuns || []).map((jr) => ({
    id: jr.id,
    job_type: jr.job_type === "collect" ? "collect" : "report",
    started_at: jr.started_at,
    completed_at: jr.completed_at,
    status: jr.status === "completed" ? "success" : jr.status === "failed" ? "error" : "running",
    new_jobs_count: jr.total_new_jobs,
    closed_jobs_count: jr.total_closed_jobs,
    insights_generated: jr.total_insights,
    companies_processed: jr.total_companies,
    error_message: jr.error_message,
  }));

  return NextResponse.json({ logs });
}
