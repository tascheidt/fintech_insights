import { createClient } from "@/lib/supabase/server";
import { startOfWeek, subDays } from "date-fns";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { RecentInsights } from "@/components/dashboard/RecentInsights";
import { HiringChart } from "@/components/dashboard/HiringChart";
import { RecentCompanyInsights } from "@/components/dashboard/RecentCompanyInsights";

export default async function DashboardPage() {
  const supabase = await createClient();

  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysAgo = subDays(now, 7).toISOString();
  const startOfWeekDate = startOfWeek(now, { weekStartsOn: 1 });

  const [
    { count: activeJobs },
    { count: newToday },
    { count: insightsCount },
    { count: thisWeek },
    { data: recentInsightsRaw },
    { data: hiringRaw },
    { data: companyInsightsRaw },
  ] = await Promise.all([
    supabase.from("job_postings").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("job_postings").select("*", { count: "exact", head: true }).gte("first_seen_date", startOfToday.toISOString()),
    supabase.from("strategic_insights").select("*", { count: "exact", head: true }).gte("run_date", sevenDaysAgo),
    supabase.from("job_postings").select("*", { count: "exact", head: true }).gte("first_seen_date", startOfWeekDate.toISOString()),
    supabase.from("strategic_insights").select("id, category, insight_summary, job_postings(title, companies(name))").order("run_date", { ascending: false }).limit(5),
    supabase.from("job_postings").select("companies(name)").eq("is_active", true),
    supabase.from("company_insights").select("id, generated_at, executive_summary, confidence, companies(name, slug)").order("generated_at", { ascending: false }).limit(5),
  ]);

  const recentInsights = (recentInsightsRaw ?? []).map((i: unknown) => {
    const x = i as { id: string; category: string | null; insight_summary: string | null; job_postings?: unknown };
    const jp = (Array.isArray(x.job_postings) ? x.job_postings[0] : x.job_postings) as { title?: string; companies?: unknown } | null | undefined;
    const co = jp?.companies;
    const companyObj = (Array.isArray(co) ? co[0] : co) as { name?: string } | null | undefined;
    return {
      id: x.id,
      category: x.category,
      insight_summary: x.insight_summary,
      job_posting: jp ? { title: jp.title ?? "", company: companyObj?.name ? { name: companyObj.name } : null } : null,
    };
  });

  const byCompany: Record<string, number> = {};
  for (const row of hiringRaw ?? []) {
    const r = row as { companies?: unknown };
    const co = (Array.isArray(r?.companies) ? r.companies[0] : r?.companies) as { name?: string } | null | undefined;
    const name = co?.name ?? "Unknown";
    byCompany[name] = (byCompany[name] ?? 0) + 1;
  }
  const hiringData = Object.entries(byCompany).map(([name, count]) => ({ name, count }));

  // Process company insights
  const companyInsights = (companyInsightsRaw ?? []).map((i: unknown) => {
    const x = i as {
      id: string;
      generated_at: string;
      executive_summary: string;
      confidence: string;
      companies?: unknown;
    };
    const co = (Array.isArray(x.companies) ? x.companies[0] : x.companies) as {
      name?: string;
      slug?: string;
    } | null | undefined;
    return {
      id: x.id,
      generated_at: x.generated_at,
      executive_summary: x.executive_summary,
      confidence: x.confidence,
      company: {
        name: co?.name ?? "Unknown",
        slug: co?.slug ?? "",
      },
    };
  });

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <StatsCards
        activeJobs={activeJobs ?? 0}
        newToday={newToday ?? 0}
        insightsCount={insightsCount ?? 0}
        thisWeek={thisWeek ?? 0}
      />
      <div className="grid gap-8 md:grid-cols-2">
        <RecentInsights insights={recentInsights} />
        <HiringChart data={hiringData} />
      </div>
      <div className="grid gap-8 md:grid-cols-2">
        <RecentCompanyInsights insights={companyInsights} />
      </div>
    </div>
  );
}
