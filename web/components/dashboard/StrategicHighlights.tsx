"use client";

/**
 * StrategicHighlights - Dashboard component showing company highlights from weekly digest.
 * 
 * Displays company summaries from the most recent weekly digest, matching the format
 * of the "Company Highlights" section in the weekly digest email and viewer.
 * 
 * Features:
 * - Pulls from weekly_digest_companies (TLDR-style company summaries)
 * - Shows punchy headlines and body text from digest
 * - Expandable cards that show full details inline (accordion pattern)
 * - Links to company detail pages within expanded content
 * 
 * @see /web/lib/analysis/digest.ts for digest generation
 */

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Sparkles, ChevronRight, ChevronDown, TrendingUp, ExternalLink } from "lucide-react";
import {
  NotionCard,
  NotionCardContent,
  NotionCardTitle,
  NotionCardDescription,
  NotionCardFooter,
  NotionCardTag,
} from "@/components/ui/notion-card";

// ============================================================================
// Types
// ============================================================================

/**
 * Strategic insight data for display in highlights panel
 */
export interface StrategicHighlight {
  /** Unique insight ID */
  id: string;
  /** Company ID */
  companyId: string;
  /** Company name for display */
  companyName: string;
  /** Company slug for URL */
  companySlug: string;
  /** When the insight was generated */
  generatedAt: string;
  /** Punchy headline with emoji (e.g., "🎯 Koho doubles down on SMB") */
  headline: string | null;
  /** One-liner explaining strategic signal */
  keySignal: string | null;
  /** 1-10 significance ranking */
  significanceScore: number | null;
  /** Confidence level */
  confidence: "high" | "medium" | "low";
  /** Executive summary excerpt for fallback */
  executiveSummary: string;
}

interface StrategicHighlightsProps {
  /** List of strategic insights to display */
  insights: StrategicHighlight[];
  /** Number of tracked companies (for header display) */
  trackedCompanyCount: number;
  /** Optional CSS classes */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Strategic highlights panel for dashboard
 */
export function StrategicHighlights({
  insights,
  trackedCompanyCount,
  className,
}: StrategicHighlightsProps) {
  // Sort by job count (if available from digest) or date
  // Digest summaries are already sorted by new_job_count, but we'll maintain order
  const sortedInsights = React.useMemo(() => {
    return [...insights]
      .sort((a, b) => {
        // Primary: significance score if available (descending)
        const scoreA = a.significanceScore ?? 0;
        const scoreB = b.significanceScore ?? 0;
        if (scoreB !== scoreA && scoreA > 0 && scoreB > 0) return scoreB - scoreA;
        // Secondary: date (most recent first)
        return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();
      })
      .slice(0, 6); // Limit to top 6
  }, [insights]);

  // Empty state
  if (sortedInsights.length === 0) {
    return (
      <div className={cn("space-y-4", className)}>
        <HighlightsHeader trackedCompanyCount={trackedCompanyCount} />
        <EmptyState />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <HighlightsHeader trackedCompanyCount={trackedCompanyCount} />
      
      {/* Insight cards */}
      <div className="space-y-3">
        {sortedInsights.map((insight) => (
          <HighlightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Header with title and link to full insights page
 */
function HighlightsHeader({ trackedCompanyCount }: { trackedCompanyCount: number }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Strategic Highlights
        </h2>
        <p className="text-sm text-muted-foreground">
          Key moves from {trackedCompanyCount} tracked {trackedCompanyCount === 1 ? "company" : "companies"}
        </p>
      </div>
      <Link
        href="/digests"
        className="text-sm text-primary hover:underline flex items-center gap-1"
      >
        View all <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

/**
 * Empty state when no insights are available
 */
function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <TrendingUp className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
      <p className="text-sm text-muted-foreground">
        No weekly digest highlights yet. Check back after the next digest is generated!
      </p>
    </div>
  );
}

/**
 * Individual highlight card with expandable details
 * 
 * Displays:
 * - Punchy headline (or fallback)
 * - Key signal or summary excerpt
 * - Company name and confidence badge
 * - Expandable full summary with link to company page
 */
function HighlightCard({ insight }: { insight: StrategicHighlight }) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  // Confidence badge styles
  const confidenceStyles = {
    high: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
    low: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  };

  // Significance badge styles (high scores get special treatment)
  const getSignificanceBadge = (score: number | null) => {
    if (!score) return null;
    if (score >= 8) {
      return (
        <NotionCardTag className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
          Major
        </NotionCardTag>
      );
    }
    if (score >= 6) {
      return (
        <NotionCardTag className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
          Notable
        </NotionCardTag>
      );
    }
    return null;
  };

  // Use headline if available, otherwise create a fallback
  const displayHeadline = insight.headline || `📊 ${insight.companyName} strategic update`;

  // Use key signal if available, otherwise use first sentence of executive summary
  const displaySignal = insight.keySignal || 
    insight.executiveSummary.split(".")[0].slice(0, 100) + "...";

  // Calculate relative time
  const relativeTime = formatDistanceToNow(new Date(insight.generatedAt), { addSuffix: true });

  // Link to company page
  const companyLink = `/companies/${insight.companySlug}`;

  return (
    <NotionCard className="transition-shadow hover:shadow-md">
      <NotionCardContent className="space-y-2">
        {/* Clickable header area */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {/* Headline - the star of the show */}
              <NotionCardTitle className="text-sm font-semibold leading-snug">
                {displayHeadline}
              </NotionCardTitle>

              {/* Key signal / description - collapsed view */}
              {!isExpanded && (
                <NotionCardDescription className="text-xs line-clamp-2 text-muted-foreground mt-1">
                  {displaySignal}
                </NotionCardDescription>
              )}
            </div>
            
            {/* Expand/collapse indicator */}
            <div className="shrink-0 mt-0.5">
              <ChevronDown 
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  isExpanded && "rotate-180"
                )} 
              />
            </div>
          </div>
        </button>

        {/* Expanded content */}
        <div 
          className={cn(
            "overflow-hidden transition-all duration-200 ease-in-out",
            isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className="pt-2 space-y-3 border-t">
            {/* Full summary */}
            <p className="text-sm text-muted-foreground leading-relaxed">
              {insight.executiveSummary}
            </p>
            
            {/* Link to company page */}
            <Link 
              href={companyLink}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              View {insight.companyName}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Footer with metadata */}
        <NotionCardFooter className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {insight.companyName}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              {relativeTime}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {getSignificanceBadge(insight.significanceScore)}
            {/* Only show confidence badge if significance score exists (not digest summaries) */}
            {insight.significanceScore !== null && (
              <NotionCardTag className={cn("text-xs", confidenceStyles[insight.confidence])}>
                {insight.confidence}
              </NotionCardTag>
            )}
          </div>
        </NotionCardFooter>
      </NotionCardContent>
    </NotionCard>
  );
}

export default StrategicHighlights;
