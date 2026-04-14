import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Calendar, Clock } from "lucide-react";
import { DigestViewer } from "@/components/digests/DigestViewer";

export default async function DigestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch digest with companies
  const { data: digest, error: digestError } = await supabase
    .from("weekly_digests")
    .select("*")
    .eq("id", id)
    .single();

  if (digestError || !digest) {
    notFound();
  }

  // Fetch company summaries
  const { data: companies, error: companiesError } = await supabase
    .from("weekly_digest_companies")
    .select(`
      *,
      companies!inner(id, name, slug)
    `)
    .eq("digest_id", id)
    .order("new_job_count", { ascending: false });

  if (companiesError) {
    console.error("Error fetching digest companies:", companiesError);
  }

  const weekStart = new Date(digest.week_start);
  const weekEnd = new Date(digest.week_end);
  const dateRange = `${format(weekStart, "MMMM d")} - ${format(weekEnd, "MMMM d, yyyy")}`;

  // Estimate reading time (roughly 200 words per minute)
  const companyCount = companies?.length || 0;
  const readingMinutes = Math.max(3, Math.ceil(companyCount * 0.5 + 2));

  // Transform data for DigestViewer
  // Handle JSONB fields that might be stored as objects
  const globalSummary = digest.global_summary as any;
  const industryTrends = (digest.industry_trends as any) || [];
  const strategySignals = (digest.strategy_signals as any) || [];
  const notableMovements = (digest.notable_movements as any) || [];

  const digestData = {
    week_start: digest.week_start,
    week_end: digest.week_end,
    generated_at: digest.generated_at,
    total_jobs: digest.total_jobs,
    total_companies: digest.total_companies,
    global_summary: globalSummary ? {
      headline: globalSummary.headline || "",
      body: globalSummary.body || "",
      key_insight: globalSummary.key_insight || (globalSummary.body ? (globalSummary.body.length > 300 ? `${globalSummary.body.substring(0, 300).trim()}…` : globalSummary.body) : "") || "",
    } : null,
    industry_trends: industryTrends,
    strategy_signals: strategySignals,
    notable_movements: notableMovements,
    companies: (companies || []).map((c: any) => {
      const company = Array.isArray(c.companies) ? c.companies[0] : c.companies;
      return {
        company_id: company?.id || "",
        company_name: company?.name || "Unknown",
        company_slug: company?.slug || "",
        new_job_count: c.new_job_count,
        current_open_job_count: c.current_open_job_count || 0,
        year_to_date_job_count: c.year_to_date_job_count || 0,
        departments: c.departments || {},
        dominant_tech: c.dominant_tech || [],
        seniority_breakdown: c.seniority_breakdown || {},
        ai_commentary: {
          headline: c.headline,
          body: c.body,
        },
        jobs: [], // Jobs not stored in digest_companies table
        hiring_pattern: {
          company_name: company?.name || "Unknown",
          week_job_count: c.new_job_count || 0,
          current_open_job_count: c.current_open_job_count || 0,
          year_to_date_job_count: c.year_to_date_job_count || 0,
          weekly_role_themes: c.weekly_role_themes || [],
          open_role_themes: c.open_role_themes || [],
          year_to_date_role_themes: c.year_to_date_role_themes || [],
          continuing_themes: c.continuing_themes || [],
          new_themes: c.new_themes || [],
          sample_titles: [],
          continuity: c.continuity || "continuing",
        },
      };
    }),
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <header className="text-center mb-8 pt-4">
        <p className="text-muted-foreground mb-4">{format(weekStart, "MMMM d, yyyy")}</p>
        
        {globalSummary?.headline && (
          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            {globalSummary.headline}
          </h1>
        )}

        <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>{dateRange}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>{readingMinutes} min read</span>
          </div>
        </div>
      </header>

      {/* In This Issue - Quick Links */}
      {digestData.companies.length > 0 && (
        <div className="border rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">IN THIS ISSUE</h2>
            <span className="text-sm text-muted-foreground">{readingMinutes} min read</span>
          </div>
          <ul className="space-y-2">
            {digestData.companies.slice(0, 5).map((company) => (
              <li key={company.company_id} className="flex items-start gap-3">
                <span className="text-lg">📊</span>
                <span className="text-sm">
                  {company.ai_commentary.headline || `${company.company_name} update`}
                </span>
              </li>
            ))}
            {digestData.companies.length > 5 && (
              <li className="text-sm text-muted-foreground pl-8">
                +{digestData.companies.length - 5} more companies
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Digest Content */}
      <DigestViewer digest={digestData} digestId={id} />
    </div>
  );
}
