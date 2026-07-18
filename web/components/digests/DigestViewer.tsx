"use client";

import type { WeeklyDigest } from "@/lib/analysis/digest";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Building2, TrendingUp, Target, Briefcase, ExternalLink, Landmark } from "lucide-react";
import {
  buildCompanySectionViews,
  buildDigestTopLinks,
  buildIncumbentWatchView,
  buildIndustryTrendRows,
  buildStrategySignalRows,
  getYearLabel,
  type SurfaceContext,
} from "@/components/digests/digest-render-helpers";

interface DigestViewerProps {
  digest: WeeklyDigest;
  digestId: string;
}

/**
 * In-app digest viewer. Thin surface-specific wrapper around the shared
 * data-shaping helpers in `digest-render-helpers.ts`. Renders the same digest
 * shape as the email template, using Tailwind primitives + Next `<Link>`.
 */
export function DigestViewer({ digest, digestId }: DigestViewerProps) {
  const ctx: SurfaceContext = { surface: "app", digestId };
  const globalSummary = digest.global_summary;
  const notableMovements = digest.notable_movements || [];
  const yearLabel = getYearLabel(digest.week_end);

  const topLinks = buildDigestTopLinks(ctx);
  const trendRows = buildIndustryTrendRows(digest, ctx);
  const signalRows = buildStrategySignalRows(digest, ctx);
  const incumbentWatch = buildIncumbentWatchView(digest, ctx);
  const companyViews = buildCompanySectionViews(digest, ctx);

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
            {globalSummary.watching && (
              <p className="text-sm text-muted-foreground border-t pt-3">
                <span className="font-medium text-foreground">What we&apos;re watching: </span>
                {globalSummary.watching}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary Stats - Interactive */}
      <div className="grid grid-cols-2 gap-4">
        <Link href={topLinks.jobsInDigest}>
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
                Browse jobs in this digest
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href={topLinks.companies}>
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
                View all companies
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Role Focus This Week */}
      {trendRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Role Focus This Week
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Role areas that appeared across multiple companies this week
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                      Theme
                    </th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">
                      Roles
                    </th>
                    <th className="text-left py-2 pl-4 font-medium text-muted-foreground">
                      Companies
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trendRows.map((row, idx) => (
                    <tr key={idx} className="border-b last:border-b-0">
                      <td className="py-2.5 pr-4 font-medium">
                        {row.href ? (
                          <Link
                            href={row.href}
                            className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                          >
                            {row.trend.trend}
                          </Link>
                        ) : (
                          row.trend.trend
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {row.trend.jobCount}
                      </td>
                      <td className="py-2.5 pl-4">
                        <div className="flex flex-wrap gap-1">
                          {row.companies.map((badge) =>
                            badge.href ? (
                              <Link
                                key={badge.companyName}
                                href={badge.href}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
                              >
                                {badge.companyName}
                              </Link>
                            ) : (
                              <span
                                key={badge.companyName}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground"
                              >
                                {badge.companyName}
                              </span>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signals — genuinely new role areas this week */}
      {signalRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Signals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {signalRows.map((row, idx) => (
                <div key={idx} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-semibold">
                        {row.companyHref ? (
                          <Link
                            href={row.companyHref}
                            className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                          >
                            {row.signal.company}
                          </Link>
                        ) : (
                          row.signal.company
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {row.signalHref ? (
                          <Link
                            href={row.signalHref}
                            className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                          >
                            {row.signal.signal}
                          </Link>
                        ) : (
                          row.signal.signal
                        )}
                      </div>
                      {row.signal.detail && (
                        <div className="text-sm mt-2">{row.signal.detail}</div>
                      )}
                      <div className="text-sm text-muted-foreground mt-2">
                        {row.signal.interpretation}
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-[10px] font-medium uppercase tracking-wide ${
                      row.signal.alignment === "aligned"
                        ? "bg-primary-soft text-primary-soft-foreground"
                        : row.signal.alignment === "divergent"
                        ? "bg-highlight-soft text-highlight-soft-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {row.signal.alignment}
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

      {/* Incumbent Watch — senior big-bank hiring interlude.
          Omitted entirely when there is no qualifying hire this week. */}
      {incumbentWatch && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Landmark className="h-4 w-4 text-muted-foreground" />
              Incumbent Watch
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              What the big banks hired for this week
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {incumbentWatch.rows.map((row) => (
                <div key={row.bank.company_id} className="space-y-1">
                  <div className="text-sm font-semibold text-foreground/90">
                    {row.head}
                  </div>
                  {row.interpretation && (
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      {row.interpretation}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1">
              <p className="text-xs text-muted-foreground">
                Bank hiring volume is excluded from the totals above.
              </p>
              <p className="text-xs text-muted-foreground">
                <Link
                  href={incumbentWatch.dashboardHref}
                  className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                >
                  See Incumbent Bets on the dashboard →
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Company Highlights */}
      {companyViews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Company Highlights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {companyViews.map((view) => {
                const { company, links, primaryFocus, isContinuing, hasNewThemes, newThemes } = view;
                return (
                  <div key={company.company_id} className="border-b last:border-b-0 pb-6 last:pb-0">
                    <div className="flex items-start justify-between mb-2">
                      <Link
                        href={links.company}
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
                      <div className="text-sm text-muted-foreground">
                        {isContinuing ? (
                          "No new role areas this week."
                        ) : hasNewThemes ? (
                          <>
                            {"New this week: "}
                            {newThemes.map((chip, idx) =>
                              chip.href ? (
                                <span key={`${chip.label}-${idx}`}>
                                  <Link
                                    href={chip.href}
                                    className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                                  >
                                    {chip.label}
                                  </Link>
                                  {chip.separator}
                                </span>
                              ) : (
                                <span key={`${chip.label}-${idx}`}>
                                  {chip.label}
                                  {chip.separator}
                                </span>
                              )
                            )}
                          </>
                        ) : (
                          "This week's mix is close to the company's recent hiring pattern."
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                        <span>
                          New jobs:{" "}
                          <Link
                            href={links.newJobs}
                            className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                          >
                            {company.new_job_count}
                          </Link>
                        </span>
                        <span>
                          Open now:{" "}
                          <Link
                            href={links.company}
                            className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                          >
                            {company.current_open_job_count}
                          </Link>
                        </span>
                        <span>
                          {yearLabel} total:{" "}
                          <Link
                            href={links.yearTotal}
                            className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                          >
                            {company.year_to_date_job_count}
                          </Link>
                        </span>
                        <span>
                          Focus:{" "}
                          {links.focus ? (
                            <Link
                              href={links.focus}
                              className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                            >
                              {primaryFocus}
                            </Link>
                          ) : (
                            primaryFocus
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
