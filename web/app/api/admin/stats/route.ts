import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { subDays } from "date-fns";

// GET /api/admin/stats - Fetch admin dashboard statistics
export async function GET() {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const weekAgo = subDays(new Date(), 7).toISOString();

  // Fetch all stats in parallel
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
    supabase.from("job_runs").select("*").eq("job_type", "collect").eq("status", "completed").order("completed_at", { ascending: false }).limit(1),
    supabase.from("job_runs").select("*").eq("job_type", "report").eq("status", "completed").order("completed_at", { ascending: false }).limit(1),
  ]);

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
        collect: lastCollectResult.data?.[0] ?? null,
        report: lastReportResult.data?.[0] ?? null,
      },
    },
  });
}
