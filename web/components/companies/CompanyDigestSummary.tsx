"use client";

/**
 * CompanyDigestSummary - Shows weekly digest summary with expandable 90-day insights
 * 
 * Displays:
 * - Weekly digest headline and body (7-day TLDR)
 * - Job count and top tech footer
 * - Expandable section showing full 90-day strategic insight with all elements
 * - Chat window for interactive Q&A
 */

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { format } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { CompanyInsightChat } from "@/components/companies/CompanyInsightChat";

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

// Colors for function groups
const GROUP_COLORS: Record<string, string> = {
  Engineering: "bg-blue-500",
  "Product & Design": "bg-purple-500",
  "Data & Analytics": "bg-indigo-500",
  "Risk, Legal & Compliance": "bg-red-500",
  "Go-To-Market": "bg-green-500",
  "Finance & Strategy": "bg-yellow-500",
  "Operations & People": "bg-orange-500",
  Other: "bg-gray-500",
};

export function CompanyDigestSummary({
  digestSummary,
  insight,
  companyId,
  companyName,
  companySlug,
}: CompanyDigestSummaryProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  // If no digest summary, show fallback message
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

  // Extract insight data
  const coreFunctions = insight?.core_functions || [];
  const newDirections = insight?.new_directions || [];
  const discrepancies = insight?.discrepancies || [];
  const researchSources = insight?.research_sources || [];

  return (
    <div className="space-y-6">
      {/* Weekly Digest Card */}
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
          {/* Weekly Digest Summary */}
          <div className="space-y-2">
            {/* Headline */}
            <h3 className="font-semibold text-lg">{digestSummary.headline}</h3>
            
            {/* Body */}
            <p className="text-sm text-muted-foreground leading-relaxed">
              {digestSummary.body}
            </p>
            
            {/* Footer stats */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-2">
              <span>{digestSummary.new_job_count} new jobs</span>
              <span>Top tech: {topTech}</span>
            </div>
          </div>

          {/* Expander for 90-day insights */}
          {insight && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full flex items-center gap-2 text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm pt-2 border-t"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Click to collapse full analysis
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Click to view full analysis
                </>
              )}
            </button>
          )}

          {/* Show message if no 90-day insight available */}
          {!insight && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Full 90-day strategic analysis will be generated soon.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expanded 90-day insights */}
      {insight && (
        <div 
          className={cn(
            "space-y-6 overflow-hidden transition-all duration-300 ease-in-out",
            isExpanded ? "max-h-none opacity-100" : "max-h-0 opacity-0"
          )}
        >
          {/* Header with badges */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold">90-Day Strategic Analysis</h2>
              <p className="text-muted-foreground">
                Analysis period: {format(new Date(insight.analysis_period_start), "MMM d")} -{" "}
                {format(new Date(insight.analysis_period_end), "MMM d, yyyy")}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  insight.confidence === "high"
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : insight.confidence === "medium"
                      ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                }`}
              >
                {insight.confidence} confidence
              </span>
              {insight.research_quality_score && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  Research: {insight.research_quality_score}/5
                </span>
              )}
            </div>
          </div>

          {/* Executive Summary */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Executive Summary</h3>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{insight.executive_summary}</p>
            </CardContent>
          </Card>

          {/* Strategic Hypothesis */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Strategic Hypothesis</h3>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{insight.strategic_hypothesis}</p>
            </CardContent>
          </Card>

          {/* Hiring by Function - with colors and constrained width */}
          {coreFunctions.length > 0 && (
            <Card>
              <CardHeader>
                <div>
                  <h3 className="font-semibold">Hiring by Function</h3>
                  <p className="text-sm text-muted-foreground">
                    {coreFunctions.reduce((sum: number, f: any) => sum + (f.count || 0), 0)} total job postings analyzed
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-w-xl space-y-3">
                  {coreFunctions.slice(0, 8).map((func: any, i: number) => {
                    const totalCount = coreFunctions.reduce((sum: number, f: any) => sum + (f.count || 0), 0);
                    const percentage = totalCount > 0 ? Math.round((func.count / totalCount) * 100) : 0;
                    const group = func.group || "Other";
                    const barColor = GROUP_COLORS[group] || "bg-gray-500";
                    
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{func.label || func.category}</span>
                          <span className="text-muted-foreground">
                            {func.count} ({percentage}%)
                          </span>
                        </div>
                        <div className="h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full ${barColor} transition-all`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* New Directions */}
          {newDirections.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="font-semibold">New Strategic Directions</h3>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {newDirections.map((direction, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-green-600 mt-1">●</span>
                      <span>{direction}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Alignment Analysis & Discrepancies */}
          {(insight.alignment_analysis || discrepancies.length > 0) && (
            <div className="grid gap-6 md:grid-cols-2">
              {insight.alignment_analysis && (
                <Card>
                  <CardHeader>
                    <h3 className="font-semibold">Alignment Analysis</h3>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{insight.alignment_analysis}</p>
                  </CardContent>
                </Card>
              )}

              {discrepancies.length > 0 && (
                <Card>
                  <CardHeader>
                    <h3 className="font-semibold">Discrepancies</h3>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {discrepancies.map((d: any, i: number) => (
                        <div
                          key={i}
                          className={`p-3 rounded-lg border-l-4 ${
                            d.severity === "high"
                              ? "border-red-500 bg-red-50 dark:bg-red-950"
                              : d.severity === "medium"
                                ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950"
                                : "border-gray-300 bg-gray-50 dark:bg-gray-900"
                          }`}
                        >
                          <div className="font-medium">{d.area}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            <strong>Stated:</strong> {d.statedStrategy || d.stated_strategy}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <strong>Actual:</strong> {d.actualHiring || d.actual_hiring}
                          </div>
                          {d.implication && (
                            <div className="text-sm mt-2">{d.implication}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Strategic Implications */}
          {insight.strategic_implications && (
            <Card>
              <CardHeader>
                <h3 className="font-semibold">Strategic Implications</h3>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{insight.strategic_implications}</p>
              </CardContent>
            </Card>
          )}

          {/* Stated Strategy from Research */}
          {insight.stated_strategy && (
            <Card>
              <CardHeader>
                <h3 className="font-semibold">Company&apos;s Stated Strategy</h3>
                <p className="text-sm text-muted-foreground">
                  Extracted from public sources
                </p>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{insight.stated_strategy}</p>
              </CardContent>
            </Card>
          )}

          {/* Research Sources */}
          {researchSources.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="font-semibold">Research Sources</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {researchSources.map((source: any, i: number) => (
                    <div key={i} className="flex items-start gap-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          source.verificationStatus === "verified"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : source.verificationStatus === "paywall"
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                        }`}
                      >
                        {source.sourceType}
                      </span>
                      <div className="flex-1 min-w-0">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline text-sm font-medium"
                        >
                          {source.title}
                        </a>
                        {source.snippet && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {source.snippet}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Model Reasoning (collapsible) */}
          {insight.model_reasoning && (
            <details className="border rounded-lg">
              <summary className="px-6 py-4 font-semibold cursor-pointer hover:bg-muted/50">
                Model Reasoning
              </summary>
              <div className="px-6 pb-4">
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {insight.model_reasoning}
                </p>
              </div>
            </details>
          )}

          {/* Metadata */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <span>
                  Generated: {format(new Date(insight.generated_at), "MMM d, yyyy HH:mm")}
                </span>
                {insight.research_depth && (
                  <span>Research Depth: {insight.research_depth}</span>
                )}
                {insight.is_public_company !== null && insight.is_public_company !== undefined && (
                  <span>
                    Company Type: {insight.is_public_company ? "Public" : "Private"}
                  </span>
                )}
                {insight.generation_cost_estimate && (
                  <span>Est. Cost: ${insight.generation_cost_estimate.toFixed(2)}</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Chat with Insight */}
          <CompanyInsightChat
            companyId={companyId}
            insightId={insight.id}
            companyName={companyName}
          />
        </div>
      )}
    </div>
  );
}
