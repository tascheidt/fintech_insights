"use client";

import { WeeklyDigest } from "@/lib/analysis/digest";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Building2, TrendingUp, Target, Briefcase, ExternalLink } from "lucide-react";

interface DigestViewerProps {
  digest: WeeklyDigest;
}

/**
 * DigestViewer - Renders a weekly digest in the same format as the email
 * Uses relative paths for Next.js navigation (not appUrl which is for emails)
 */
export function DigestViewer({ digest }: DigestViewerProps) {
  const globalSummary = digest.global_summary;
  const industryTrends = digest.industry_trends || [];
  const strategySignals = digest.strategy_signals || [];
  const notableMovements = digest.notable_movements || [];

  return (
    <div className="space-y-6">
      {/* Global Summary */}
      {globalSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{globalSummary.headline}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {globalSummary.key_insight && (
              <p className="text-lg font-medium text-primary">
                {globalSummary.key_insight}
              </p>
            )}
            <p className="text-muted-foreground">{globalSummary.body}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats - Interactive */}
      <div className="grid grid-cols-2 gap-4">
        <Link href="/jobs">
          <Card className="hover:shadow-md transition-shadow cursor-pointer group">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold">{digest.total_jobs}</div>
                  <div className="text-sm text-muted-foreground">New Jobs</div>
                </div>
                <Briefcase className="h-8 w-8 text-muted-foreground/30 group-hover:text-primary transition-colors" />
              </div>
              <div className="text-xs text-muted-foreground mt-2 group-hover:text-primary transition-colors">
                Browse all jobs →
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/companies">
          <Card className="hover:shadow-md transition-shadow cursor-pointer group">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold">{digest.total_companies}</div>
                  <div className="text-sm text-muted-foreground">Companies</div>
                </div>
                <Building2 className="h-8 w-8 text-muted-foreground/30 group-hover:text-primary transition-colors" />
              </div>
              <div className="text-xs text-muted-foreground mt-2 group-hover:text-primary transition-colors">
                View all companies →
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Industry Trends */}
      {industryTrends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Industry Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {industryTrends.map((trend, idx) => (
                <div key={idx} className="border-l-2 border-primary pl-4">
                  <div className="font-semibold">{trend.trend}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {trend.explanation}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Companies: {trend.companies.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Strategy Signals */}
      {strategySignals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Strategy Signals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {strategySignals.map((signal, idx) => (
                <div key={idx} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-semibold">{signal.company}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {signal.signal}
                      </div>
                      <div className="text-sm mt-2">{signal.detail}</div>
                      <div className="text-sm text-muted-foreground mt-2">
                        {signal.interpretation}
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      signal.alignment === "aligned" 
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : signal.alignment === "divergent"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    }`}>
                      {signal.alignment}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notable Movements */}
      {notableMovements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Notable Movements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {notableMovements.map((movement, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <div className="text-sm">
                    <span className="font-semibold">{movement.company}</span>: {movement.description}
                    {movement.sourceUrl && (
                      <a 
                        href={movement.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 ml-2 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {movement.sourceTitle || "Source"}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Company Highlights */}
      {digest.companies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Company Highlights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {digest.companies.map((company) => (
                <div key={company.company_id} className="border-b last:border-b-0 pb-6 last:pb-0">
                  <div className="flex items-start justify-between mb-2">
                    <Link 
                      href={`/companies/${company.company_slug}`}
                      className="font-semibold text-lg hover:underline flex items-center gap-2"
                    >
                      <Building2 className="h-4 w-4" />
                      {company.company_name}
                    </Link>
                  </div>
                  <div className="space-y-2">
                    <div className="font-medium">{company.ai_commentary.headline}</div>
                    <div className="text-sm text-muted-foreground">
                      {company.ai_commentary.body}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                      <Link 
                        href={`/companies/${company.company_slug}`}
                        className="hover:text-primary transition-colors"
                      >
                        {company.new_job_count} new jobs →
                      </Link>
                      <Link 
                        href={`/companies/${company.company_slug}/insights`}
                        className="hover:text-primary transition-colors"
                      >
                        View 90-day analysis →
                      </Link>
                      <span>Top tech: {company.dominant_tech.slice(0, 3).join(", ") || "Various"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
