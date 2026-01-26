/**
 * Dashboard Page - Main entry point after login.
 *
 * Features:
 * - Interactive stats cards with drill-down
 * - Trend visualizations (Posting velocity & Function mix)
 * - Companies overview with card/table toggle
 * - Strategic highlights from most recent weekly digest
 */

import { createClient } from "@/lib/supabase/server";
import { startOfWeek, subDays, subWeeks } from "date-fns";
import { CompaniesOverview } from "@/components/dashboard/CompaniesOverview";
import { StrategicHighlights } from "@/components/dashboard/StrategicHighlights";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { PostingTrendChart } from "@/components/dashboard/charts/PostingTrendChart";
import { FunctionBreakdownContainer } from "@/components/dashboard/charts/FunctionBreakdownContainer";
import { getPostingTrends, getRawFunctionData } from "@/lib/dashboard-queries";
import { transformCompanyData, transformDigestHighlights, CompanyRow, DigestCompanyRow } from "@/lib/dashboard-transformers";

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
    // Company insights count (last 7 days) - kept for stats
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
        job_postings!left(id, is_active, title, first_seen_date)
      `)
      .eq("is_active", true)
      .order("name"),
    // Most recent weekly digest and company summaries
    (async () => {
      // Get most recent digest by week_start
      const { data: latestDigest } = await supabase
        .from("weekly_digests")
        .select("id, generated_at, week_start, week_end")
        .order("week_start", { ascending: false })
        .limit(1)
        .single();

      if (!latestDigest) {
        return { data: null };
      }

      // Get company summaries for this digest, filtered by active companies
      const { data: digestCompanies } = await supabase
        .from("weekly_digest_companies")
        .select(`
          id,
          company_id,
          headline,
          body,
          new_job_count,
          companies!inner(id, name, slug, is_active)
        `)
        .eq("digest_id", latestDigest.id)
        .eq("companies.is_active", true)
        .order("new_job_count", { ascending: false });

      // Return with digest metadata
      return {
        data: {
          digest: latestDigest,
          companies: digestCompanies || [],
        },
      };
    })(),
    // New Trend Data
    getPostingTrends(90), // Last 3 months
    getRawFunctionData(90), // Last 3 months raw data for client-side filtering
  ]);

  // Transform data
  const companies = transformCompanyData(companiesRaw as CompanyRow[]);
  const digestResponse = companyInsightsRaw as { digest: { generated_at: string; week_start: string; week_end: string }; companies: DigestCompanyRow[] } | null;
  const strategicHighlights = transformDigestHighlights(digestResponse);
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
