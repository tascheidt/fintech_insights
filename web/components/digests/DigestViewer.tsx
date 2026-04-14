"use client";

import { WeeklyDigest, CompanyWeeklySummary } from "@/lib/analysis/digest";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Building2, TrendingUp, Target, Briefcase, ExternalLink } from "lucide-react";
import { buildDigestLink } from "@/lib/email/links";
import { getThemeIdByLabel } from "@/lib/analysis/role-themes";

interface DigestViewerProps {
  digest: WeeklyDigest;
  digestId: string;
}

/** Resolve a company display name back to its slug via the digest payload. */
function findCompanySlug(
  companies: CompanyWeeklySummary[],
  companyName: string
): string | null {
  const match = companies.find((entry) => entry.company_name === companyName);
  return match?.company_slug ?? null;
}

/**
 * DigestViewer - Renders a weekly digest in the same format as the email
 * Uses relative paths for Next.js navigation (not appUrl which is for emails)
 */
export function DigestViewer({ digest, digestId }: DigestViewerProps) {
  const globalSummary = digest.global_summary;
  const industryTrends = digest.industry_trends || [];
  const strategySignals = digest.strategy_signals || [];
  const notableMovements = digest.notable_movements || [];
  const yearStartIso = `${new Date(digest.week_end).getUTCFullYear()}-01-01`;
  const yearLabel = yearStartIso.slice(0, 4);

  const jobsInDigestHref = buildDigestLink({
    surface: "app",
    digestId,
    target: { kind: "jobs", inDigest: true },
  });
  const companiesHref = buildDigestLink({
    surface: "app",
    digestId,
    target: { kind: "companies" },
  });

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
        <Link href={jobsInDigestHref}>
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
        <Link href={companiesHref}>
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
      {industryTrends.length > 0 && (
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
                  {industryTrends.map((trend, idx) => {
                    const themeId = getThemeIdByLabel(trend.trend);
                    const trendHref = themeId
                      ? buildDigestLink({
                          surface: "app",
                          digestId,
                          target: { kind: "jobs", theme: themeId, inDigest: true },
                        })
                      : null;
                    return (
                      <tr key={idx} className="border-b last:border-b-0">
                        <td className="py-2.5 pr-4 font-medium">
                          {trendHref ? (
                            <Link
                              href={trendHref}
                              className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                            >
                              {trend.trend}
                            </Link>
                          ) : (
                            trend.trend
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {trend.jobCount}
                        </td>
                        <td className="py-2.5 pl-4">
                          <div className="flex flex-wrap gap-1">
                            {trend.companies.map((companyName) => {
                              const slug = findCompanySlug(digest.companies, companyName);
                              if (!slug) {
                                return (
                                  <span
                                    key={companyName}
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground"
                                  >
                                    {companyName}
                                  </span>
                                );
                              }
                              const badgeHref = buildDigestLink({
                                surface: "app",
                                digestId,
                                target: {
                                  kind: "jobs",
                                  company: slug,
                                  ...(themeId ? { theme: themeId } : {}),
                                  inDigest: true,
                                },
                              });
                              return (
                                <Link
                                  key={companyName}
                                  href={badgeHref}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
                                >
                                  {companyName}
                                </Link>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* New This Week */}
      {strategySignals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              New This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {strategySignals.map((signal, idx) => {
                const signalSlug = findCompanySlug(digest.companies, signal.company);
                const companyHref = signalSlug
                  ? buildDigestLink({
                      surface: "app",
                      digestId,
                      target: { kind: "company", slug: signalSlug },
                    })
                  : null;
                const signalHref = signalSlug
                  ? buildDigestLink({
                      surface: "app",
                      digestId,
                      target: { kind: "jobs", company: signalSlug, inDigest: true },
                    })
                  : null;
                return (
                  <div key={idx} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold">
                          {companyHref ? (
                            <Link
                              href={companyHref}
                              className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                            >
                              {signal.company}
                            </Link>
                          ) : (
                            signal.company
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {signalHref ? (
                            <Link
                              href={signalHref}
                              className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                            >
                              {signal.signal}
                            </Link>
                          ) : (
                            signal.signal
                          )}
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
                );
              })}
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
              {digest.companies.map((company) => {
                const slug = company.company_slug;
                const primaryFocus =
                  company.hiring_pattern.weekly_role_themes[0]?.label || "Various roles";
                const primaryFocusThemeId =
                  company.hiring_pattern.weekly_role_themes[0]?.id ?? null;
                const newThemes = company.hiring_pattern.new_themes;
                const isContinuing = company.hiring_pattern.continuity === "continuing";
                const hasNewThemes = newThemes.length > 0;

                const companyHref = buildDigestLink({
                  surface: "app",
                  digestId,
                  target: { kind: "company", slug },
                });
                const newJobsHref = buildDigestLink({
                  surface: "app",
                  digestId,
                  target: { kind: "jobs", company: slug, inDigest: true },
                });
                const yearTotalHref = buildDigestLink({
                  surface: "app",
                  digestId,
                  target: { kind: "jobs", company: slug, from: yearStartIso },
                });
                const focusHref = primaryFocusThemeId
                  ? buildDigestLink({
                      surface: "app",
                      digestId,
                      target: {
                        kind: "jobs",
                        company: slug,
                        theme: primaryFocusThemeId,
                        inDigest: true,
                      },
                    })
                  : null;

                return (
                  <div key={company.company_id} className="border-b last:border-b-0 pb-6 last:pb-0">
                    <div className="flex items-start justify-between mb-2">
                      <Link
                        href={companyHref}
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
                          `This continues an existing hiring pattern for ${company.company_name}.`
                        ) : hasNewThemes ? (
                          <>
                            {"New this week: "}
                            {newThemes.map((themeLabel, idx) => {
                              const themeId = getThemeIdByLabel(themeLabel);
                              const separator = idx < newThemes.length - 1 ? ", " : ".";
                              if (!themeId) {
                                return (
                                  <span key={`${themeLabel}-${idx}`}>
                                    {themeLabel}
                                    {separator}
                                  </span>
                                );
                              }
                              const themeHref = buildDigestLink({
                                surface: "app",
                                digestId,
                                target: {
                                  kind: "jobs",
                                  company: slug,
                                  theme: themeId,
                                  inDigest: true,
                                },
                              });
                              return (
                                <span key={`${themeLabel}-${idx}`}>
                                  <Link
                                    href={themeHref}
                                    className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                                  >
                                    {themeLabel}
                                  </Link>
                                  {separator}
                                </span>
                              );
                            })}
                          </>
                        ) : (
                          "This week's mix is close to the company's recent hiring pattern."
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                        <span>
                          New jobs:{" "}
                          <Link
                            href={newJobsHref}
                            className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                          >
                            {company.new_job_count}
                          </Link>
                        </span>
                        <span>
                          Open now:{" "}
                          <Link
                            href={companyHref}
                            className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                          >
                            {company.current_open_job_count}
                          </Link>
                        </span>
                        <span>
                          {yearLabel} total:{" "}
                          <Link
                            href={yearTotalHref}
                            className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                          >
                            {company.year_to_date_job_count}
                          </Link>
                        </span>
                        <span>
                          Focus:{" "}
                          {focusHref ? (
                            <Link
                              href={focusHref}
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
