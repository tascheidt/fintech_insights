import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { subDays } from "date-fns";

// GET /api/admin/stats - Fetch admin dashboard statistics
// Uses unified job_runs table for all job tracking
export async function GET() {
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

  const weekAgo = subDays(new Date(), 7).toISOString();

  // Fetch all stats in parallel
  // Note: Uses job_runs table for all job tracking (unified system)
  const [
    companiesResult,
    activeCompaniesResult,
    totalJobsResult,
    activeJobsResult,
    newJobsResult,
    insightsResult,
    recentInsightsResult,
    usersResult,
    lastCollectResult,
    lastReportResult,
  ] = await Promise.all([
    supabase.from("companies").select("*", { count: "exact", head: true }),
    supabase.from("companies").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("job_postings").select("*", { count: "exact", head: true }),
    supabase.from("job_postings").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("job_postings").select("*", { count: "exact", head: true }).gte("first_seen_date", weekAgo),
    supabase.from("strategic_insights").select("*", { count: "exact", head: true }),
    supabase.from("strategic_insights").select("*", { count: "exact", head: true }).gte("run_date", weekAgo),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    // Query job_runs for collect jobs (unified job tracking)
    supabase.from("job_runs").select("*").eq("job_type", "collect").eq("status", "completed").order("completed_at", { ascending: false }).limit(1),
    // Query job_runs for report jobs (unified job tracking)
    supabase.from("job_runs").select("*").eq("job_type", "report").eq("status", "completed").order("completed_at", { ascending: false }).limit(1),
  ]);

  // Transform job_runs data to match expected lastRuns format
  const transformJobRun = (jobRun: Record<string, unknown> | null) => {
    if (!jobRun) return null;
    return {
      id: jobRun.id,
      job_type: jobRun.job_type,
      started_at: jobRun.started_at,
      completed_at: jobRun.completed_at,
      status: jobRun.status === "completed" ? "success" : jobRun.status === "failed" ? "error" : "running",
      new_jobs_count: jobRun.total_new_jobs,
      closed_jobs_count: jobRun.total_closed_jobs,
      insights_generated: jobRun.total_insights,
      companies_processed: jobRun.total_companies,
      error_message: jobRun.error_message,
      details: jobRun.details,
    };
  };

  return NextResponse.json({
    stats: {
      companies: {
        total: companiesResult.count ?? 0,
        active: activeCompaniesResult.count ?? 0,
      },
      jobs: {
        total: totalJobsResult.count ?? 0,
        active: activeJobsResult.count ?? 0,
        newThisWeek: newJobsResult.count ?? 0,
      },
      insights: {
        total: insightsResult.count ?? 0,
        thisWeek: recentInsightsResult.count ?? 0,
      },
      users: {
        total: usersResult.count ?? 0,
      },
      lastRuns: {
        collect: transformJobRun(lastCollectResult.data?.[0] ?? null),
        report: transformJobRun(lastReportResult.data?.[0] ?? null),
      },
    },
  });
}
