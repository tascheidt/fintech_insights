"use client";

/**
 * CompanyInsightsCard - Display-only card for 90-day company insights
 * 
 * Shows the full insight content without expand/collapse.
 * Used in the insights history page to display past analyses.
 */

import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";

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
  is_public_company: boolean | null;
}

interface CompanyInsightsCardProps {
  insight: CompanyInsight;
  companySlug: string;
  isLatest?: boolean;
}

export function CompanyInsightsCard({
  insight,
  companySlug,
  isLatest = false,
}: CompanyInsightsCardProps) {
  const coreFunctions = insight.core_functions || [];
  const newDirections = insight.new_directions || [];
  const topFunctions = coreFunctions.slice(0, 5);

  return (
    <Card className={isLatest ? "border-primary" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold">
              {isLatest ? "Latest Strategic Insight" : "Strategic Insight"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {format(new Date(insight.analysis_period_start), "MMM d")} -{" "}
              {format(new Date(insight.analysis_period_end), "MMM d, yyyy")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
              {insight.confidence}
            </span>
            {insight.research_quality_score && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                {insight.research_quality_score}/5 research
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Executive Summary */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">
            Executive Summary
          </h3>
          <p className="text-sm">{insight.executive_summary}</p>
        </div>

        {/* Strategic Hypothesis */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">
            Strategic Hypothesis
          </h3>
          <p className="text-sm">{insight.strategic_hypothesis}</p>
        </div>

        {/* Top Functions */}
        {topFunctions.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Top Hiring Functions
            </h3>
            <div className="flex flex-wrap gap-2">
              {topFunctions.map((func: any, i: number) => (
                <span
                  key={i}
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-muted"
                >
                  {func.label || func.category} ({func.count})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* New Directions */}
        {newDirections.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">
              New Directions Detected
            </h3>
            <ul className="text-sm space-y-1">
              {newDirections.slice(0, 3).map((direction, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-green-600">●</span>
                  <span className="line-clamp-1">{direction}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            Generated {format(new Date(insight.generated_at), "MMM d, yyyy HH:mm")}
          </span>
          <Link 
            href={`/companies/${companySlug}/insights/${insight.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            View full details
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
