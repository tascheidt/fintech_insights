/**
 * Dashboard Page - Main entry point after login.
 *
 * Features:
 * - Interactive stats cards with drill-down
 * - Trend visualizations (Posting velocity & Function mix)
 * - Companies overview with card/table toggle
 * - Strategic highlights from company-level insights
 */

import { createClient } from "@/lib/supabase/server";
import { startOfWeek, subDays, subWeeks } from "date-fns";
import { CompaniesOverview } from "@/components/dashboard/CompaniesOverview";
import { StrategicHighlights } from "@/components/dashboard/StrategicHighlights";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { PostingTrendChart } from "@/components/dashboard/charts/PostingTrendChart";
import { FunctionBreakdownContainer } from "@/components/dashboard/charts/FunctionBreakdownContainer";
import { getPostingTrends, getRawFunctionData } from "@/lib/dashboard-queries";
import { transformCompanyData, transformStrategicHighlights, CompanyRow, CompanyInsightRow } from "@/lib/dashboard-transformers";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Date calculations
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysAgo = subDays(now, 7).toISOString();
  const fourteenDaysAgo = subDays(now, 14).toISOString();
  const startOfWeekDate = startOfWeek(now, { weekStartsOn: 1 });
  const startOfLastWeekDate = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

  // Fetch all data in parallel
  const [
    { count: activeJobs },
    { count: newToday },
    { count: insightsCount },
    { count: thisWeek },
    { count: lastWeek },
    { data: companiesRaw },
    { data: companyInsightsRaw },
    postingTrends,
    rawFunctionData,
  ] = await Promise.all([
    // Active jobs count
    supabase
      .from("job_postings")
      .select("*, companies!inner(is_active)", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("companies.is_active", true),
    // New today count
    supabase
      .from("job_postings")
      .select("*, companies!inner(is_active)", { count: "exact", head: true })
      .gte("first_seen_date", startOfToday.toISOString())
      .eq("companies.is_active", true),
    // Company insights count (last 7 days)
    supabase
      .from("company_insights")
      .select("*", { count: "exact", head: true })
      .gte("generated_at", sevenDaysAgo),
    // This week new jobs
    supabase
      .from("job_postings")
      .select("*, companies!inner(is_active)", { count: "exact", head: true })
      .gte("first_seen_date", startOfWeekDate.toISOString())
      .eq("companies.is_active", true),
    // Last week new jobs (for trend calculation)
    supabase
      .from("job_postings")
      .select("*, companies!inner(is_active)", { count: "exact", head: true })
      .gte("first_seen_date", startOfLastWeekDate.toISOString())
      .lt("first_seen_date", startOfWeekDate.toISOString())
      .eq("companies.is_active", true),
    // All active companies with job counts
    supabase
      .from("companies")
      .select(`
        id,
        name,
        slug,
        country,
        ats_type,
        track_for_strategy,
        job_postings!left(id, is_active, title, first_seen_date)
      `)
      .eq("is_active", true)
      .order("name"),
    // Strategic company insights (last 14 days)
    supabase
      .from("company_insights")
      .select(`
        id,
        company_id,
        generated_at,
        headline,
        key_signal,
        significance_score,
        confidence,
        executive_summary,
        companies!inner(id, name, slug, is_active)
      `)
      .eq("companies.is_active", true)
      .gte("generated_at", fourteenDaysAgo)
      .order("significance_score", { ascending: false, nullsFirst: false })
      .order("generated_at", { ascending: false })
      .limit(50),
    // New Trend Data
    getPostingTrends(90), // Last 3 months
    getRawFunctionData(90), // Last 3 months raw data for client-side filtering
  ]);

  // Transform data
  const companies = transformCompanyData(companiesRaw as CompanyRow[]);
  const strategicHighlights = transformStrategicHighlights(companyInsightsRaw as CompanyInsightRow[]);
  const trackedCompanyCount = companies.length;

  // Prepare simple company list for filter
  const companyList = (companiesRaw as CompanyRow[] ?? []).map(c => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Quick Stats - Interactive */}
      <StatsCards
        activeJobs={activeJobs ?? 0}
        newToday={newToday ?? 0}
        insightsCount={insightsCount ?? 0}
        newThisWeek={thisWeek ?? 0}
        newLastWeek={lastWeek ?? 0}
      />

      {/* Main Trends Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Posting Velocity - Takes 2/3 width */}
        <PostingTrendChart data={postingTrends} />

        {/* Function Mix - Takes 1/3 width */}
        <FunctionBreakdownContainer rawData={rawFunctionData} companies={companyList} />
      </div>

      {/* Main Content Grid - Stacks on mobile, 50/50 split on desktop */}
      <div className="flex flex-col gap-6 sm:gap-8 lg:grid lg:grid-cols-2">
        {/* Strategic Highlights - Promoted to equal footing */}
        <div className="lg:col-span-1">
          <StrategicHighlights
            insights={strategicHighlights}
            trackedCompanyCount={trackedCompanyCount}
          />
        </div>

        {/* Companies Overview */}
        <div className="lg:col-span-1">
          <CompaniesOverview companies={companies} />
        </div>
      </div>
    </div>
  );
}
