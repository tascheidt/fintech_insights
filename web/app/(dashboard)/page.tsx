/**
 * Dashboard Page - Main entry point after login.
 * 
 * Features:
 * - Personalized welcome message
 * - Companies overview with card/table toggle
 * - Weekly digests with TLDR-style headlines
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
    { data: weeklyDigestsRaw },
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
    // Digests count (last 7 days)
    supabase
      .from("weekly_digests")
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
    // Recent weekly digest company summaries (with TLDR headlines!)
    supabase
      .from("weekly_digest_companies")
      .select(`
        id,
        headline,
        body,
        new_job_count,
        created_at,
        weekly_digests!inner(id, generated_at),
        companies!inner(id, name, slug, is_active)
      `)
      .eq("companies.is_active", true)
      .order("created_at", { ascending: false })
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

  // Types for weekly digest data
  interface DigestCompanyRow {
    id: string;
    headline: string;
    body: string;
    new_job_count: number;
    created_at: string;
    weekly_digests?: { id: string; generated_at: string }[] | { id: string; generated_at: string };
    companies?: { id: string; name: string; slug: string }[] | { id: string; name: string; slug: string };
  }

  // Process weekly digest data - now with TLDR headlines!
  const digestInsights: DigestInsight[] = (weeklyDigestsRaw as DigestCompanyRow[] ?? []).map((item) => {
    const company = Array.isArray(item.companies) 
      ? item.companies[0] 
      : item.companies;
    const digest = Array.isArray(item.weekly_digests)
      ? item.weekly_digests[0]
      : item.weekly_digests;
    
    return {
      id: item.id,
      companyName: company?.name ?? "Unknown",
      companySlug: company?.slug ?? "",
      generatedAt: digest?.generated_at ?? item.created_at,
      // TLDR-style fields from weekly_digest_companies
      headline: item.headline,
      whatItMeans: item.body,
      executiveSummary: item.body, // Fallback for older display logic
      confidence: "high" as const, // Digests don't have confidence, default to high
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
