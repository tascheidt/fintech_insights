"use client";

/**
 * DigestArchive - Shows archived weekly digests grouped by date.
 * 
 * Displays historical insights allowing users to view past analyses.
 */

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow, startOfWeek, endOfWeek } from "date-fns";
import {
  FileText,
  Calendar,
  Building2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NotionCard,
  NotionCardContent,
  NotionCardTitle,
  NotionCardDescription,
  NotionCardFooter,
  NotionCardTag,
} from "@/components/ui/notion-card";

/** Archived insight data */
export interface ArchivedInsight {
  id: string;
  companyName: string;
  companySlug: string;
  generatedAt: string;
  executiveSummary: string;
  confidence: "high" | "medium" | "low";
}

/** Grouped digest by week */
export interface WeeklyDigest {
  weekStart: Date;
  weekEnd: Date;
  insights: ArchivedInsight[];
}

interface DigestArchiveProps {
  insights: ArchivedInsight[];
  className?: string;
}

/**
 * Group insights by week
 */
function groupByWeek(insights: ArchivedInsight[]): WeeklyDigest[] {
  const weekMap = new Map<string, WeeklyDigest>();

  for (const insight of insights) {
    const date = new Date(insight.generatedAt);
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const weekKey = weekStart.toISOString();

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, {
        weekStart,
        weekEnd: endOfWeek(date, { weekStartsOn: 1 }),
        insights: [],
      });
    }

    weekMap.get(weekKey)!.insights.push(insight);
  }

  // Sort weeks descending (most recent first)
  return Array.from(weekMap.values()).sort(
    (a, b) => b.weekStart.getTime() - a.weekStart.getTime()
  );
}

/**
 * Digest archive component
 */
export function DigestArchive({ insights, className }: DigestArchiveProps) {
  const [expandedWeeks, setExpandedWeeks] = React.useState<Set<string>>(new Set());

  const weeklyDigests = React.useMemo(() => groupByWeek(insights), [insights]);

  // Auto-expand first week
  React.useEffect(() => {
    if (weeklyDigests.length > 0) {
      setExpandedWeeks(new Set([weeklyDigests[0].weekStart.toISOString()]));
    }
  }, [weeklyDigests]);

  const toggleWeek = (weekKey: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekKey)) {
        next.delete(weekKey);
      } else {
        next.add(weekKey);
      }
      return next;
    });
  };

  if (insights.length === 0) {
    return (
      <div className={cn("space-y-4", className)}>
        <h2 className="text-lg font-semibold">Digest Archive</h2>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No archived digests yet. Insights will appear here after analysis runs.
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
          <h2 className="text-lg font-semibold">Digest Archive</h2>
          <p className="text-sm text-muted-foreground">
            {weeklyDigests.length} week{weeklyDigests.length !== 1 ? "s" : ""} of analysis
          </p>
        </div>
      </div>

      {/* Weekly digests */}
      <div className="space-y-3">
        {weeklyDigests.map((digest) => {
          const weekKey = digest.weekStart.toISOString();
          const isExpanded = expandedWeeks.has(weekKey);
          const relativeTime = formatDistanceToNow(digest.weekStart, { addSuffix: true });

          return (
            <div key={weekKey} className="rounded-lg border overflow-hidden">
              {/* Week header */}
              <button
                type="button"
                onClick={() => toggleWeek(weekKey)}
                className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    Week of {format(digest.weekStart, "MMMM d, yyyy")}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{relativeTime}</span>
                    <span>·</span>
                    <span>
                      {digest.insights.length} compan{digest.insights.length !== 1 ? "ies" : "y"}
                    </span>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </button>

              {/* Week content */}
              {isExpanded && (
                <div className="border-t p-4 bg-muted/20">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {digest.insights.map((insight) => (
                      <ArchivedInsightCard key={insight.id} insight={insight} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Individual archived insight card
 */
function ArchivedInsightCard({ insight }: { insight: ArchivedInsight }) {
  const confidenceStyles = {
    high: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    low: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  return (
    <Link href={`/companies/${insight.companySlug}/insights/${insight.id}`}>
      <NotionCard className="h-full">
        <NotionCardContent>
          {/* Company header */}
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <NotionCardTitle className="text-sm">{insight.companyName}</NotionCardTitle>
              <p className="text-xs text-muted-foreground">
                {format(new Date(insight.generatedAt), "MMM d, h:mm a")}
              </p>
            </div>
          </div>

          {/* Summary */}
          <NotionCardDescription className="mt-2 text-xs line-clamp-2">
            {insight.executiveSummary}
          </NotionCardDescription>

          {/* Footer */}
          <NotionCardFooter className="mt-2">
            <NotionCardTag className={cn("text-xs", confidenceStyles[insight.confidence])}>
              {insight.confidence}
            </NotionCardTag>
            <ChevronRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </NotionCardFooter>
        </NotionCardContent>
      </NotionCard>
    </Link>
  );
}

export default DigestArchive;
