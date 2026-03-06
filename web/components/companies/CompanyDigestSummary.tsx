"use client";

/**
 * CompanyDigestSummary - Shows weekly digest summary with link to full insight
 */

import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";

interface DigestSummary {
  id: string;
  headline: string;
  body: string;
  new_job_count: number;
  dominant_tech: string[];
  weekly_digests: {
    week_start: string;
    week_end: string;
  };
}

interface CompanyInsight {
  id: string;
  generated_at: string;
  analysis_period_start: string;
  analysis_period_end: string;
  executive_summary: string;
  strategic_hypothesis: string;
  confidence: string;
  core_functions: any[];
  new_directions: string[];
  research_quality_score: number | null;
  alignment_analysis?: string | null;
  discrepancies?: any[];
  strategic_implications?: string | null;
  stated_strategy?: string | null;
  research_sources?: any[];
  model_reasoning?: string | null;
  research_depth?: string | null;
  is_public_company?: boolean | null;
  generation_cost_estimate?: number | null;
}

interface CompanyDigestSummaryProps {
  digestSummary: DigestSummary | null;
  insight: CompanyInsight | null;
  companyId: string;
  companyName: string;
  companySlug: string;
}

export function CompanyDigestSummary({
  digestSummary,
  insight,
  companyName,
  companySlug,
}: CompanyDigestSummaryProps) {
  if (!digestSummary) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <h3 className="font-semibold mb-2">No Weekly Summary Yet</h3>
            <p className="text-muted-foreground text-sm">
              {companyName} will appear in the weekly digest after the next report is generated.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const topTech = digestSummary.dominant_tech?.slice(0, 3).join(", ") || "Various";
  const weekStart = format(new Date(digestSummary.weekly_digests.week_start), "MMM d");
  const weekEnd = format(new Date(digestSummary.weekly_digests.week_end), "MMM d, yyyy");

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">Recent Highlights</h2>
            <p className="text-sm text-muted-foreground">
              {weekStart} - {weekEnd}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">{digestSummary.headline}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {digestSummary.body}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-2">
            <span>{digestSummary.new_job_count} new jobs</span>
            <span>Top tech: {topTech}</span>
          </div>
        </div>

        {/* Link to full insight or placeholder */}
        {insight ? (
          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
              {insight.executive_summary}
            </p>
            <Link
              href={`/companies/${companySlug}/insights/${insight.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              View full analysis
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Full 90-day strategic analysis will be generated soon.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
