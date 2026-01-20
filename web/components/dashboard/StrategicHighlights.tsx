"use client";

/**
 * StrategicHighlights - Dashboard component showing top company-level strategic insights.
 * 
 * Displays curated, ranked insights from company_insights table instead of generic
 * "Company X is hiring" cards. Shows only the most significant strategic moves
 * (4-6 insights max) based on significance_score.
 * 
 * Features:
 * - Pulls from company_insights (deep strategic analysis)
 * - Ranked by significance_score (1-10)
 * - Shows punchy headlines with key signals
 * - Links to full company insight detail page
 * 
 * @see /web/lib/analysis/company-insights.ts for insight generation
 */

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Sparkles, ChevronRight, TrendingUp } from "lucide-react";
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
  // Sort by significance score (highest first), then by date
  const sortedInsights = React.useMemo(() => {
    return [...insights]
      .sort((a, b) => {
        // Primary: significance score (descending)
        const scoreA = a.significanceScore ?? 0;
        const scoreB = b.significanceScore ?? 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
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
        href="/insights"
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
        No strategic insights yet. Check back after the next analysis run!
      </p>
    </div>
  );
}

/**
 * Individual highlight card
 * 
 * Displays:
 * - Punchy headline (or fallback)
 * - Key signal or summary excerpt
 * - Company name and confidence badge
 */
function HighlightCard({ insight }: { insight: StrategicHighlight }) {
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

  return (
    <Link href={`/companies/${insight.companySlug}/insights/${insight.id}`}>
      <NotionCard className="hover:shadow-md transition-shadow">
        <NotionCardContent className="space-y-2">
          {/* Headline - the star of the show */}
          <NotionCardTitle className="text-sm font-semibold leading-snug">
            {displayHeadline}
          </NotionCardTitle>

          {/* Key signal / description */}
          <NotionCardDescription className="text-xs line-clamp-2 text-muted-foreground">
            {displaySignal}
          </NotionCardDescription>

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
              <NotionCardTag className={cn("text-xs", confidenceStyles[insight.confidence])}>
                {insight.confidence}
              </NotionCardTag>
            </div>
          </NotionCardFooter>
        </NotionCardContent>
      </NotionCard>
    </Link>
  );
}

export default StrategicHighlights;
