import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { subDays } from "date-fns";

// GET /api/admin/stats - Fetch admin dashboard statistics
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
  const dayAgo = subDays(new Date(), 1).toISOString();

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
    supabase.from("cron_logs").select("*").eq("job_type", "collect").eq("status", "success").order("completed_at", { ascending: false }).limit(1),
    supabase.from("cron_logs").select("*").eq("job_type", "report").eq("status", "success").order("completed_at", { ascending: false }).limit(1),
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
