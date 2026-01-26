import { CompanyOverviewData } from "@/components/dashboard/CompaniesOverview";
import { StrategicHighlight } from "@/components/dashboard/StrategicHighlights";

// Types for Supabase data
export interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  country: string;
  ats_type: string;
  job_postings?: JobPostingRow[];
}

export interface JobPostingRow {
  id: string;
  is_active: boolean;
  title: string;
  first_seen_date: string | null;
}

export interface CompanyInsightRow {
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

export interface DigestCompanyRow {
  id: string;
  company_id: string;
  headline: string;
  body: string;
  new_job_count: number;
  companies?: { id: string; name: string; slug: string }[] | { id: string; name: string; slug: string };
}

/**
 * Transforms raw company data into the overview format
 */
export function transformCompanyData(companiesRaw: CompanyRow[] | null): CompanyOverviewData[] {
  const companies = (companiesRaw ?? []).map((company) => {
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
    };
  });

  // Sort companies by job count descending
  return companies.sort((a, b) => b.activeJobCount - a.activeJobCount);
}

/**
 * Transforms raw insight data into strategic highlights
 * Deduplicates by company_id, keeping the most significant/recent one
 */
export function transformStrategicHighlights(insightsRaw: CompanyInsightRow[] | null): StrategicHighlight[] {
  const insightsMap = new Map<string, CompanyInsightRow>();
  
  for (const item of (insightsRaw ?? [])) {
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
  return Array.from(insightsMap.values())
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
}

/**
 * Transforms weekly digest company summaries into strategic highlights format
 * Matches the format used in the weekly digest "Company Highlights" section
 */
export function transformDigestHighlights(
  digestData: { digest: { generated_at: string; week_start: string; week_end: string }; companies: DigestCompanyRow[] } | null
): StrategicHighlight[] {
  if (!digestData || !digestData.companies || digestData.companies.length === 0) {
    return [];
  }

  const { digest, companies } = digestData;

  return companies.map((item) => {
    const company = Array.isArray(item.companies) 
      ? item.companies[0] 
      : item.companies;

    // Extract first sentence from body for keySignal fallback
    const firstSentence = item.body.split(".")[0].trim();
    const keySignal = firstSentence.length > 0 && firstSentence.length < 150 
      ? firstSentence + (item.body.includes(".") ? "." : "")
      : item.body.slice(0, 150) + (item.body.length > 150 ? "..." : "");

    return {
      id: item.id,
      companyId: item.company_id,
      companyName: company?.name ?? "Unknown",
      companySlug: company?.slug ?? "",
      generatedAt: digest.generated_at,
      headline: item.headline,
      keySignal: keySignal,
      significanceScore: null, // Digest summaries don't have significance scores
      confidence: "medium" as const, // Default confidence for digest summaries
      executiveSummary: item.body,
    };
  });
}
