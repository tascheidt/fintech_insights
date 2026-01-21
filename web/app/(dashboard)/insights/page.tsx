/**
 * Insights Page - Weekly digest view with latest insights and archive.
 * 
 * Shows:
 * - Latest strategic insights grouped by company
 * - Archived weekly digests organized by week
 */

import { createClient } from "@/lib/supabase/server";
import { subDays } from "date-fns";
import {
  LatestDigestInsights,
  LatestInsight,
} from "@/components/insights/LatestDigestInsights";
import {
  DigestArchive,
  ArchivedInsight,
} from "@/components/insights/DigestArchive";

export default async function InsightsPage() {
  const supabase = await createClient();

  // Date for separating "latest" from "archive"
  const sevenDaysAgo = subDays(new Date(), 7).toISOString();

  // Fetch recent company insights (last 7 days = latest)
  const { data: latestInsightsRaw } = await supabase
    .from("company_insights")
    .select(`
      id,
      company_id,
      generated_at,
      executive_summary,
      strategic_hypothesis,
      confidence,
      new_directions,
      companies!inner(id, name, slug, is_active)
    `)
    .eq("companies.is_active", true)
    .gte("generated_at", sevenDaysAgo)
    .order("generated_at", { ascending: false });

  // Fetch older company insights for archive
  const { data: archivedInsightsRaw } = await supabase
    .from("company_insights")
    .select(`
      id,
      generated_at,
      executive_summary,
      confidence,
      companies!inner(name, slug, is_active)
    `)
    .eq("companies.is_active", true)
    .lt("generated_at", sevenDaysAgo)
    .order("generated_at", { ascending: false })
    .limit(100);

  // Types for Supabase data
  interface CompanyRef {
    name: string;
    slug: string;
  }

  interface LatestInsightRow {
    id: string;
    company_id: string;
    generated_at: string;
    executive_summary: string;
    strategic_hypothesis: string;
    confidence: "high" | "medium" | "low";
    new_directions?: string[] | string | null;
    companies?: CompanyRef[] | CompanyRef;
  }

  interface ArchivedInsightRow {
    id: string;
    generated_at: string;
    executive_summary: string;
    confidence: "high" | "medium" | "low";
    companies?: CompanyRef[] | CompanyRef;
  }

  // Transform latest insights
  const latestInsights: LatestInsight[] = (latestInsightsRaw as LatestInsightRow[] ?? []).map(
    (insight) => {
      const company = Array.isArray(insight.companies)
        ? insight.companies[0]
        : insight.companies;

      // Parse new_directions if it's a string
      let newDirections: string[] = [];
      if (insight.new_directions) {
        if (Array.isArray(insight.new_directions)) {
          newDirections = insight.new_directions.map(String);
        } else if (typeof insight.new_directions === "string") {
          try {
            const parsed = JSON.parse(insight.new_directions);
            newDirections = Array.isArray(parsed) ? parsed.map(String) : [];
          } catch {
            newDirections = [];
          }
        }
      }

      return {
        id: insight.id,
        companyId: insight.company_id,
        companyName: company?.name ?? "Unknown",
        companySlug: company?.slug ?? "",
        generatedAt: insight.generated_at,
        executiveSummary: insight.executive_summary ?? "",
        strategicHypothesis: insight.strategic_hypothesis ?? "",
        confidence: insight.confidence ?? "medium",
        newDirections,
      };
    }
  );

  // Transform archived insights
  const archivedInsights: ArchivedInsight[] = (archivedInsightsRaw as ArchivedInsightRow[] ?? []).map(
    (insight) => {
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
    }
  );

  return (
    <div className="space-y-6 sm:space-y-10">
      {/* Page header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Weekly Insights</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          Strategic analysis of hiring patterns across tracked companies
        </p>
      </div>

      {/* Latest insights section */}
      <LatestDigestInsights insights={latestInsights} />

      {/* Divider */}
      {archivedInsights.length > 0 && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-3 text-sm text-muted-foreground">
              Previous Digests
            </span>
          </div>
        </div>
      )}

      {/* Archive section */}
      {archivedInsights.length > 0 && (
        <DigestArchive insights={archivedInsights} />
      )}
    </div>
  );
}
