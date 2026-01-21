"use client";

/**
 * LatestDigestInsights - Shows the most recent strategic insights grouped by company.
 * 
 * Displays insights from the latest analysis run with company context.
 */

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import {
  Building2,
  Calendar,
  Sparkles,
  TrendingUp,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import {
  NotionCard,
  NotionCardContent,
  NotionCardTitle,
  NotionCardDescription,
  NotionCardFooter,
  NotionCardTag,
} from "@/components/ui/notion-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Company insight data */
export interface LatestInsight {
  id: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  generatedAt: string;
  executiveSummary: string;
  strategicHypothesis: string;
  confidence: "high" | "medium" | "low";
  newDirections?: string[];
}

interface LatestDigestInsightsProps {
  insights: LatestInsight[];
  className?: string;
}

/**
 * Latest digest insights component
 */
export function LatestDigestInsights({ insights, className }: LatestDigestInsightsProps) {
  if (insights.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <h2 className="text-lg font-semibold">Latest Strategic Insights</h2>
          <p className="text-sm text-muted-foreground">
            Most recent analysis from the weekly digest
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-8 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No insights generated yet. Run the analysis to generate strategic insights.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Get the most recent generation date
  const latestDate = insights.reduce((latest, i) => {
    const date = new Date(i.generatedAt);
    return date > latest ? date : latest;
  }, new Date(0));

  const formattedDate = format(latestDate, "EEEE, MMMM d, yyyy");
  const relativeTime = formatDistanceToNow(latestDate, { addSuffix: true });

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Latest Strategic Insights</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-1">
            <Calendar className="h-4 w-4" />
            <span>{formattedDate}</span>
            <span className="hidden sm:inline">·</span>
            <span>{relativeTime}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm self-start sm:self-auto">
          <Sparkles className="h-4 w-4" />
          <span>{insights.length} companies analyzed</span>
        </div>
      </div>

      {/* Insights grid */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
}

/**
 * Individual insight card
 */
function InsightCard({ insight }: { insight: LatestInsight }) {
  const confidenceStyles = {
    high: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    low: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  return (
    <Link href={`/companies/${insight.companySlug}/insights/${insight.id}`}>
      <NotionCard className="h-full">
        <NotionCardContent className="flex flex-col h-full">
          {/* Company header */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <NotionCardTitle>{insight.companyName}</NotionCardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(insight.generatedAt), "MMM d, h:mm a")}
              </p>
            </div>
            <NotionCardTag className={confidenceStyles[insight.confidence]}>
              {insight.confidence}
            </NotionCardTag>
          </div>

          {/* Executive summary */}
          <NotionCardDescription className="mt-4 line-clamp-3">
            {insight.executiveSummary}
          </NotionCardDescription>

          {/* Strategic hypothesis teaser */}
          {insight.strategicHypothesis && (
            <div className="mt-3 p-2 rounded-md bg-muted/50">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Strategic Hypothesis
              </p>
              <p className="text-xs line-clamp-2">{insight.strategicHypothesis}</p>
            </div>
          )}

          {/* New directions */}
          {insight.newDirections && insight.newDirections.length > 0 && (
            <div className="mt-3 flex items-center gap-1 text-xs text-primary">
              <TrendingUp className="h-3 w-3" />
              <span>{insight.newDirections.length} new direction{insight.newDirections.length > 1 ? 's' : ''} detected</span>
            </div>
          )}

          {/* Footer */}
          <NotionCardFooter className="mt-auto pt-4">
            <span className="text-xs text-muted-foreground">View full analysis</span>
            <ChevronRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </NotionCardFooter>
        </NotionCardContent>
      </NotionCard>
    </Link>
  );
}

export default LatestDigestInsights;
