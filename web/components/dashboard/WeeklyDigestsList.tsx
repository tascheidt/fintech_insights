"use client";

/**
 * WeeklyDigestsList - Recent company-level insights grouped by date.
 * Headlines follow neutral editorial voice (docs/voice.md): plain, specific, no emoji.
 */

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { FileText, Calendar, ChevronRight } from "lucide-react";
import {
  NotionCard,
  NotionCardContent,
  NotionCardTitle,
  NotionCardDescription,
  NotionCardFooter,
  NotionCardTag,
} from "@/components/ui/notion-card";

/**
 * Company insight data for display
 */
export interface DigestInsight {
  id: string;
  companyName: string;
  companySlug: string;
  generatedAt: string;
  /** Short analytical headline (plain language) */
  headline?: string;
  /** Key takeaway line when available */
  whatItMeans?: string;
  executiveSummary: string;
  confidence: "high" | "medium" | "low";
}

interface WeeklyDigestsListProps {
  insights: DigestInsight[];
  className?: string;
}

/**
 * Weekly digests list component
 */
export function WeeklyDigestsList({ insights, className }: WeeklyDigestsListProps) {
  // Group insights by date (YYYY-MM-DD)
  const groupedByDate = React.useMemo(() => {
    const groups = new Map<string, DigestInsight[]>();
    
    for (const insight of insights) {
      const dateKey = insight.generatedAt.split("T")[0];
      const existing = groups.get(dateKey) || [];
      groups.set(dateKey, [...existing, insight]);
    }
    
    // Sort dates descending (most recent first)
    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 5); // Limit to 5 most recent dates
  }, [insights]);

  if (insights.length === 0) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">This week&apos;s highlights</h2>
            <p className="text-sm text-muted-foreground">
              What&apos;s happening in Canadian fintech
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Nothing to report yet. Check back after the next analysis run!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">This week&apos;s highlights</h2>
          <p className="text-sm text-muted-foreground">
            What&apos;s happening in Canadian fintech
          </p>
        </div>
        <Link
          href="/insights"
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          View all <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Grouped digests */}
      <div className="space-y-6">
        {groupedByDate.map(([dateKey, dateInsights]) => (
          <DigestDateGroup
            key={dateKey}
            date={dateKey}
            insights={dateInsights}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Group of insights for a specific date
 */
function DigestDateGroup({
  date,
  insights,
}: {
  date: string;
  insights: DigestInsight[];
}) {
  const dateObj = new Date(date);
  const formattedDate = format(dateObj, "EEEE, MMMM d");
  const relativeTime = formatDistanceToNow(dateObj, { addSuffix: true });

  return (
    <div className="space-y-3">
      {/* Date header */}
      <div className="flex items-center gap-2 text-sm">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{formattedDate}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{relativeTime}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          {insights.length} {insights.length === 1 ? "company" : "companies"}
        </span>
      </div>

      {/* Insight cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {insights.map((insight) => (
          <DigestInsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
}

/**
 * Individual insight card — headline, excerpt, company footer.
 */
function DigestInsightCard({ insight }: { insight: DigestInsight }) {
  const confidenceStyles = {
    high: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
    low: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  };

  // Use headline if available, fallback to company name
  const displayHeadline = insight.headline || `${insight.companyName} — company insight`;

  return (
    <Link href={`/companies/${insight.companySlug}/insights/${insight.id}`}>
      <NotionCard className="h-full hover:shadow-md transition-shadow">
        <NotionCardContent className="space-y-3">
          {/* Headline */}
          <NotionCardTitle className="text-sm font-semibold leading-snug">
            {displayHeadline}
          </NotionCardTitle>

          {/* Plain-language takeaway or summary excerpt */}
          <NotionCardDescription className="text-xs line-clamp-2 text-muted-foreground">
            {insight.whatItMeans || insight.executiveSummary}
          </NotionCardDescription>

          {/* Footer with company name and confidence */}
          <NotionCardFooter className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {insight.companyName}
            </span>
            <NotionCardTag className={cn("text-xs", confidenceStyles[insight.confidence])}>
              {insight.confidence}
            </NotionCardTag>
          </NotionCardFooter>
        </NotionCardContent>
      </NotionCard>
    </Link>
  );
}

export default WeeklyDigestsList;
