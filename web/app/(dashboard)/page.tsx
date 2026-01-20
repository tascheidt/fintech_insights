/**
 * Dashboard Page - Main entry point after login.
 * 
 * Features:
 * - Personalized welcome message
 * - Companies overview with card/table toggle
 * - Weekly insights/digests preview
 * - Quick stats overview
 */

import { createClient } from "@/lib/supabase/server";
import { startOfWeek, subDays } from "date-fns";
import { WelcomeMessage } from "@/components/dashboard/WelcomeMessage";
import { CompaniesOverview, CompanyOverviewData } from "@/components/dashboard/CompaniesOverview";
import { WeeklyDigestsList, DigestInsight } from "@/components/dashboard/WeeklyDigestsList";
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
    // Insights count (last 7 days)
    supabase
      .from("company_insights")
      .select("*, companies!inner(is_active)", { count: "exact", head: true })
      .gte("generated_at", sevenDaysAgo)
      .eq("companies.is_active", true),
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
    // Recent company insights for digests
    supabase
      .from("company_insights")
      .select(`
        id,
        generated_at,
        executive_summary,
        confidence,
        companies!inner(name, slug, is_active)
      `)
      .eq("companies.is_active", true)
      .order("generated_at", { ascending: false })
      .limit(15),
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

  // Types for company insights
  interface InsightRow {
    id: string;
    generated_at: string;
    executive_summary: string;
    confidence: "high" | "medium" | "low";
    companies?: { name: string; slug: string }[] | { name: string; slug: string };
  }

  // Process company insights for digests
  const digestInsights: DigestInsight[] = (companyInsightsRaw as InsightRow[] ?? []).map((insight) => {
    const company = Array.isArray(insight.companies) 
      ? insight.companies[0] 
      : insight.companies;
    
    return {
      id: insight.id,
      companyName: company?.name ?? "Unknown",
      companySlug: company?.slug ?? "",
      generatedAt: insight.generated_at,
      executiveSummary: insight.executive_summary ?? "",
      confidence: insight.confidence ?? "medium",
    };
  });

  return (
    <div className="space-y-8">
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

      {/* Main Content Grid */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Companies Overview - Takes 2 columns */}
        <div className="lg:col-span-2">
          <CompaniesOverview companies={companies} />
        </div>

        {/* Weekly Digests - Takes 1 column */}
        <div className="lg:col-span-1">
          <WeeklyDigestsList insights={digestInsights} />
        </div>
      </div>
    </div>
  );
}
