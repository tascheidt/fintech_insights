/**
 * Dashboard Page - Main entry point after login.
 * 
 * Features:
 * - Personalized welcome message
 * - Companies overview with card/table toggle
 * - Strategic highlights from company-level insights
 * - Quick stats overview
 */

import { createClient } from "@/lib/supabase/server";
import { startOfWeek, subDays } from "date-fns";
import { WelcomeMessage } from "@/components/dashboard/WelcomeMessage";
import { CompaniesOverview, CompanyOverviewData } from "@/components/dashboard/CompaniesOverview";
import { StrategicHighlights, StrategicHighlight } from "@/components/dashboard/StrategicHighlights";
import { StatsCards } from "@/components/dashboard/StatsCards";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Get current user for welcome message
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get user profile for name
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single()
    : { data: null };

  // Date calculations
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysAgo = subDays(now, 7).toISOString();
  const fourteenDaysAgo = subDays(now, 14).toISOString();
  const startOfWeekDate = startOfWeek(now, { weekStartsOn: 1 });

  // Fetch all data in parallel
  const [
    { count: activeJobs },
    { count: newToday },
    { count: insightsCount },
    { count: thisWeek },
    { data: companiesRaw },
    { data: companyInsightsRaw },
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
    // Company insights count (last 7 days) - changed from weekly_digests
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
    // Strategic company insights (last 14 days) - NEW: from company_insights table
    // Ordered by significance_score for dashboard highlights
    // Fetch more than needed to deduplicate by company_id (show only most recent per company)
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
      .limit(50), // Fetch more to allow deduplication
  ]);

  // Types for Supabase data
  interface CompanyRow {
    id: string;
    name: string;
    slug: string;
    country: string;
    ats_type: string;
    track_for_strategy: boolean;
    job_postings?: JobPostingRow[];
  }

  interface JobPostingRow {
    id: string;
    is_active: boolean;
    title: string;
    first_seen_date: string | null;
  }

  // Process companies data
  const companies: CompanyOverviewData[] = (companiesRaw as CompanyRow[] ?? []).map((company) => {
    // Count active jobs
    const jobs = Array.isArray(company.job_postings) ? company.job_postings : [];
    const activeJobCount = jobs.filter((j) => j.is_active).length;
    
    // Get most recent job title as highlight
    const sortedJobs = jobs
      .filter((j) => j.is_active)
      .sort((a, b) => 
        new Date(b.first_seen_date || 0).getTime() - new Date(a.first_seen_date || 0).getTime()
      );
    const recentHighlight = sortedJobs.length > 0
      ? `Latest: ${sortedJobs[0].title}`
      : null;

    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      country: company.country,
      activeJobCount,
      recentHighlight,
      atsType: company.ats_type,
      trackForStrategy: company.track_for_strategy,
    };
  });

  // Sort companies by job count descending
  companies.sort((a, b) => b.activeJobCount - a.activeJobCount);

  // Count of tracked companies (for highlights header)
  const trackedCompanyCount = companies.length;

  // Types for company insight data
  interface CompanyInsightRow {
    id: string;
    company_id: string;
    generated_at: string;
    headline: string | null;
    key_signal: string | null;
    significance_score: number | null;
    confidence: "high" | "medium" | "low";
    executive_summary: string;
    companies?: { id: string; name: string; slug: string }[] | { id: string; name: string; slug: string };
  }

  // Process company insights for strategic highlights
  // Deduplicate by company_id - keep only the most recent insight per company
  const insightsMap = new Map<string, CompanyInsightRow>();
  for (const item of (companyInsightsRaw as CompanyInsightRow[] ?? [])) {
    const existing = insightsMap.get(item.company_id);
    if (!existing) {
      insightsMap.set(item.company_id, item);
    } else {
      // Keep the one with higher significance_score, or more recent if scores are equal
      const existingScore = existing.significance_score ?? 0;
      const itemScore = item.significance_score ?? 0;
      if (itemScore > existingScore || 
          (itemScore === existingScore && new Date(item.generated_at) > new Date(existing.generated_at))) {
        insightsMap.set(item.company_id, item);
      }
    }
  }

  // Convert to array and sort by significance_score, limit to top 10
  const strategicHighlights: StrategicHighlight[] = Array.from(insightsMap.values())
    .sort((a, b) => {
      const scoreA = a.significance_score ?? 0;
      const scoreB = b.significance_score ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime();
    })
    .slice(0, 10)
    .map((item) => {
      const company = Array.isArray(item.companies) 
        ? item.companies[0] 
        : item.companies;
      
      return {
        id: item.id,
        companyId: item.company_id,
        companyName: company?.name ?? "Unknown",
        companySlug: company?.slug ?? "",
        generatedAt: item.generated_at,
        headline: item.headline,
        keySignal: item.key_signal,
        significanceScore: item.significance_score,
        confidence: item.confidence,
        executiveSummary: item.executive_summary,
      };
    });

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Welcome Message */}
      <WelcomeMessage
        userName={profile?.full_name}
        userEmail={profile?.email || user?.email}
      />

      {/* Quick Stats */}
      <StatsCards
        activeJobs={activeJobs ?? 0}
        newToday={newToday ?? 0}
        insightsCount={insightsCount ?? 0}
        thisWeek={thisWeek ?? 0}
      />

      {/* Main Content Grid - Stacks on mobile, 2/1 split on desktop */}
      <div className="flex flex-col gap-6 sm:gap-8 lg:grid lg:grid-cols-3">
        {/* Companies Overview - Takes 2 columns on desktop */}
        <div className="lg:col-span-2">
          <CompaniesOverview companies={companies} />
        </div>

        {/* Strategic Highlights - Takes 1 column on desktop */}
        <div className="lg:col-span-1">
          <StrategicHighlights 
            insights={strategicHighlights} 
            trackedCompanyCount={trackedCompanyCount}
          />
        </div>
      </div>
    </div>
  );
}
