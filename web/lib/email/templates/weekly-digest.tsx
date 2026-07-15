import React from "react";
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Link,
  Hr,
} from "@react-email/components";
import type { GlobalSummary, WeeklyDigest } from "@/lib/analysis/digest";
import {
  buildCompanySectionViews,
  buildDigestTopLinks,
  buildIncumbentWatchView,
  buildIndustryTrendRows,
  buildStrategySignalRows,
  formatDateRange,
  type CompanySectionView,
  type SurfaceContext,
} from "@/components/digests/digest-render-helpers";
import { EMAIL_COLORS } from "@/lib/email/colors";

interface WeeklyDigestEmailProps {
  digest: WeeklyDigest;
  digestId: string;
  appUrl?: string;
  version?: string;
}

/**
 * Global summary section — cross-company overview
 * Displays cross-company trend analysis at the top of the email
 */
function GlobalSummarySection({ summary }: { summary: GlobalSummary }) {
  return (
    <Section style={globalSummarySection}>
      <Heading as="h2" style={globalHeadline}>
        {summary.headline}
      </Heading>
      {summary.key_insight && (
        <Text style={{
          ...globalBody,
          fontSize: "16px",
          fontWeight: "600",
          color: EMAIL_COLORS.fg,
          marginBottom: "14px",
          lineHeight: "1.5",
        }}>
          {summary.key_insight}
        </Text>
      )}
      <Text style={globalBody}>
        {summary.body}
      </Text>
    </Section>
  );
}

/**
 * "What we're watching" — optional forward-looking closer from the AI lede
 * (editorial v2). Omitted entirely when the digest has no watch item.
 */
function WatchingSection({ watching }: { watching: string }) {
  return (
    <Section style={companySection}>
      <Heading as="h2" style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>
        What we&apos;re watching
      </Heading>
      <Text style={{ fontSize: "14px", color: EMAIL_COLORS.fg2, lineHeight: "1.6", margin: "0" }}>
        {watching}
      </Text>
    </Section>
  );
}

/**
 * Per-company section. The data shaping (slug, hrefs, leading-theme,
 * continuity flags) lives in the shared helpers; this component only owns
 * the email-specific primitives + styles.
 */
function CompanySection({
  view,
  yearLabel,
}: {
  view: CompanySectionView;
  yearLabel: string;
}) {
  const { company, primaryFocus, isContinuing, hasNewThemes, newThemes, links } = view;

  return (
    <Section style={companySection}>
      {/* Company Name - Clickable */}
      <Link href={links.company} style={{ ...companyName, color: EMAIL_COLORS.fg, textDecoration: "none" }}>
        {company.company_name}
      </Link>

      {/* AI Headline */}
      <Heading as="h3" style={headline}>
        {company.ai_commentary.headline}
      </Heading>

      {/* AI Body */}
      <Text style={bodyText}>
        {company.ai_commentary.body}
      </Text>

      <Text style={{ ...statsLine, marginBottom: "12px", color: EMAIL_COLORS.fg2 }}>
        {isContinuing ? (
          "No new role areas this week."
        ) : hasNewThemes ? (
          <>
            {"New this week: "}
            {newThemes.map((chip, idx) =>
              chip.href ? (
                <React.Fragment key={`${chip.label}-${idx}`}>
                  <Link href={chip.href} style={inlineLink}>
                    {chip.label}
                  </Link>
                  {chip.separator}
                </React.Fragment>
              ) : (
                <React.Fragment key={`${chip.label}-${idx}`}>
                  {chip.label}
                  {chip.separator}
                </React.Fragment>
              )
            )}
          </>
        ) : (
          "This week's mix is close to the company's recent hiring pattern."
        )}
      </Text>

      {/* Stats Footer */}
      <Text style={statsLine}>
        <span style={statLabel}>New Jobs:</span>{" "}
        <Link href={links.newJobs} style={inlineLink}>
          {String(company.new_job_count)}
        </Link>
        {" | "}
        <span style={statLabel}>Open Now:</span>{" "}
        <Link href={links.company} style={inlineLink}>
          {String(company.current_open_job_count)}
        </Link>
        {" | "}
        <span style={statLabel}>{yearLabel} Total:</span>{" "}
        <Link href={links.yearTotal} style={inlineLink}>
          {String(company.year_to_date_job_count)}
        </Link>
        {" | "}
        <span style={statLabel}>Focus:</span>{" "}
        {links.focus ? (
          <Link href={links.focus} style={inlineLink}>
            {primaryFocus}
          </Link>
        ) : (
          primaryFocus
        )}
      </Text>
    </Section>
  );
}

/**
 * Weekly Digest Email Template
 *
 * Clean, minimal design with neutral AI commentary per company.
 *
 * Thin surface-specific wrapper around the shared helpers in
 * `web/components/digests/digest-render-helpers.ts`. All data shaping
 * (slug lookups, link building, theme resolution, continuity logic) lives
 * there; this file only owns the email primitives + inline styles.
 */
export function WeeklyDigestEmail({
  digest,
  digestId,
  appUrl = "https://fintech-talent-brief.vercel.app",
  version,
}: WeeklyDigestEmailProps) {
  const ctx: SurfaceContext = { surface: "email", digestId, appUrl };
  const dateRange = formatDateRange(digest.week_start, digest.week_end);
  const previewText = `The Fintech Talent Brief: ${digest.total_jobs} new jobs across ${digest.total_companies} companies this week`;
  const topLinks = buildDigestTopLinks(ctx);
  const trendRows = buildIndustryTrendRows(digest, ctx);
  const signalRows = buildStrategySignalRows(digest, ctx);
  const incumbentWatch = buildIncumbentWatchView(digest, ctx);
  const companyViews = buildCompanySectionViews(digest, ctx);
  const yearLabel = `${new Date(digest.week_end).getUTCFullYear()}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading as="h1" style={title}>
              The Fintech Talent Brief
            </Heading>
            <Text style={subtitle}>
              {dateRange}
            </Text>
            <Text style={{ textAlign: "center" as const, marginTop: "12px", marginBottom: "0" }}>
              <Link href={topLinks.digest} style={{
                color: EMAIL_COLORS.fgMuted,
                fontSize: "13px",
                textDecoration: "underline",
              }}>
                View full digest in app
              </Link>
            </Text>
          </Section>

          {/* Global Summary - Cross-company trend analysis */}
          {digest.global_summary && (
            <GlobalSummarySection summary={digest.global_summary} />
          )}

          {/* Summary Stats */}
          <Section style={summarySection}>
            <table style={statsTable}>
              <tbody>
                <tr>
                  <td style={statCell}>
                    <Link href={topLinks.jobsInDigest} style={statCellLink}>
                      <span style={statNumberSpan}>{String(digest.total_jobs)}</span>
                      <span style={statDescriptionSpan}>New Jobs</span>
                    </Link>
                  </td>
                  <td style={statCell}>
                    <Link href={topLinks.digest} style={statCellLink}>
                      <span style={statNumberSpan}>{String(digest.total_companies)}</span>
                      <span style={statDescriptionSpan}>Companies</span>
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Signals — genuinely new role areas this week */}
          {signalRows.length > 0 && (
            <>
              <Hr style={divider} />
              <Section style={companySection}>
                <Heading as="h2" style={{ fontSize: "18px", fontWeight: "600", marginBottom: "12px" }}>
                  Signals
                </Heading>
                {signalRows.slice(0, 3).map((row, idx) => (
                  <div key={idx} style={{ marginBottom: "16px", paddingBottom: "16px", borderBottom: idx < Math.min(signalRows.length - 1, 2) ? `1px solid ${EMAIL_COLORS.border}` : "none" }}>
                    <Text style={{ fontWeight: "600", marginBottom: "4px" }}>
                      {row.companyHref ? (
                        <Link href={row.companyHref} style={inlineLink}>
                          {row.signal.company}
                        </Link>
                      ) : (
                        row.signal.company
                      )}
                    </Text>
                    <Text style={{ fontSize: "14px", color: EMAIL_COLORS.fgMuted, marginBottom: "8px" }}>
                      {row.signalHref ? (
                        <Link href={row.signalHref} style={inlineLink}>
                          {row.signal.signal}
                        </Link>
                      ) : (
                        row.signal.signal
                      )}
                    </Text>
                    {row.signal.detail && (
                      <Text style={{ fontSize: "13px", color: EMAIL_COLORS.fg2, lineHeight: "1.5", marginBottom: "6px" }}>
                        {row.signal.detail}
                      </Text>
                    )}
                    <Text style={{ fontSize: "12px", color: EMAIL_COLORS.fgMuted }}>
                      {row.signal.interpretation}
                    </Text>
                  </div>
                ))}
                {signalRows.length > 3 && (
                  <Text style={{ fontSize: "12px", color: EMAIL_COLORS.fgMuted, marginTop: "8px" }}>
                    <Link href={topLinks.digest} style={inlineLink}>
                      +{signalRows.length - 3} more signals in full digest
                    </Link>
                  </Text>
                )}
              </Section>
            </>
          )}

          {/* Role Focus This Week */}
          {trendRows.length > 0 && (
            <>
              <Hr style={divider} />
              <Section style={companySection}>
                <Heading as="h2" style={{ fontSize: "18px", fontWeight: "600", marginBottom: "4px" }}>
                  Role Focus This Week
                </Heading>
                <Text style={{ fontSize: "13px", color: EMAIL_COLORS.fgMuted, marginBottom: "12px" }}>
                  The role areas that showed up across multiple companies this week
                </Text>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${EMAIL_COLORS.border}` }}>
                      <th style={{ textAlign: "left", padding: "6px 8px 6px 0", fontWeight: "600", color: EMAIL_COLORS.fgMuted }}>Theme</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: "600", color: EMAIL_COLORS.fgMuted }}>Roles</th>
                      <th style={{ textAlign: "left", padding: "6px 0 6px 8px", fontWeight: "600", color: EMAIL_COLORS.fgMuted }}>Companies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendRows.slice(0, 5).map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: idx < Math.min(trendRows.length - 1, 4) ? `1px solid ${EMAIL_COLORS.borderSubtle}` : "none" }}>
                        <td style={{ padding: "8px 8px 8px 0", fontWeight: "500" }}>
                          {row.href ? (
                            <Link href={row.href} style={inlineLink}>
                              {row.trend.trend}
                            </Link>
                          ) : (
                            row.trend.trend
                          )}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {String(row.trend.jobCount)}
                        </td>
                        <td style={{ padding: "8px 0 8px 8px", color: EMAIL_COLORS.fgMuted }}>
                          {row.companies.map((badge, companyIdx) => {
                            const separator = companyIdx < row.companies.length - 1 ? ", " : "";
                            if (!badge.href) {
                              return (
                                <React.Fragment key={`${badge.companyName}-${companyIdx}`}>
                                  {badge.companyName}
                                  {separator}
                                </React.Fragment>
                              );
                            }
                            return (
                              <React.Fragment key={`${badge.companyName}-${companyIdx}`}>
                                <Link href={badge.href} style={inlineLink}>
                                  {badge.companyName}
                                </Link>
                                {separator}
                              </React.Fragment>
                            );
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            </>
          )}

          {/* Incumbent Watch — senior big-bank hiring interlude.
              Bracketed by dividers; empty => block and both dividers omitted. */}
          {incumbentWatch && (
            <>
              <Hr style={divider} />
              <Section style={companySection}>
                <Heading as="h2" style={{ fontSize: "18px", fontWeight: "600", marginBottom: "4px" }}>
                  Incumbent Watch
                </Heading>
                <Text style={{ fontSize: "13px", color: EMAIL_COLORS.fgMuted, marginBottom: "12px" }}>
                  What the big banks hired for this week
                </Text>
                {incumbentWatch.rows.map((row, idx) => (
                  <div key={row.bank.company_id} style={{ marginBottom: idx < incumbentWatch.rows.length - 1 ? "16px" : "12px" }}>
                    <Text style={{ fontSize: "14px", fontWeight: "600", color: EMAIL_COLORS.fg2, margin: "0 0 4px" }}>
                      {row.head}
                    </Text>
                    {row.interpretation && (
                      <Text style={{ fontSize: "13px", lineHeight: "1.6", color: EMAIL_COLORS.fg2, margin: "0" }}>
                        {row.interpretation}
                      </Text>
                    )}
                  </div>
                ))}
                <Text style={{ fontSize: "12px", color: EMAIL_COLORS.fgMuted, margin: "0", lineHeight: "1.5" }}>
                  Bank hiring volume is excluded from the totals above.
                </Text>
                <Text style={{ fontSize: "12px", color: EMAIL_COLORS.fgMuted, margin: "0" }}>
                  <Link href={incumbentWatch.dashboardHref} style={inlineLink}>
                    See Incumbent Bets on the dashboard →
                  </Link>
                </Text>
              </Section>
            </>
          )}

          <Hr style={divider} />

          {/* Company Sections */}
          {companyViews.map((view) => (
            <CompanySection
              key={view.company.company_id}
              view={view}
              yearLabel={yearLabel}
            />
          ))}

          {/* No companies message */}
          {companyViews.length === 0 && (
            <Section style={emptySection}>
              <Text style={emptyText}>
                No new job postings this week. Check back next Monday!
              </Text>
            </Section>
          )}

          {/* What we're watching — forward-looking closer (editorial v2) */}
          {digest.global_summary?.watching && (
            <>
              <Hr style={divider} />
              <WatchingSection watching={digest.global_summary.watching} />
            </>
          )}

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              <Link href={topLinks.digest} style={footerLink}>
                View full digest in app →
              </Link>
            </Text>
            <Text style={footerMuted}>
              The Fintech Talent Brief | Hiring Intelligence for Fintech
            </Text>
            {version && (
              <Text style={footerVersion}>
                v{version}
                {" – "}
                <Link href={topLinks.releases} style={footerVersionLink}>
                  See what&apos;s new
                </Link>
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ============================================================================
// Styles
// ============================================================================

const main: React.CSSProperties = {
  backgroundColor: EMAIL_COLORS.bg,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container: React.CSSProperties = {
  backgroundColor: EMAIL_COLORS.surface,
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "600px",
};

const header: React.CSSProperties = {
  padding: "32px 40px 24px",
  textAlign: "center" as const,
};

const title: React.CSSProperties = {
  color: EMAIL_COLORS.fg,
  fontSize: "28px",
  fontWeight: "700",
  lineHeight: "1.2",
  margin: "0 0 8px",
};

const subtitle: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "14px",
  margin: "0",
};

const globalSummarySection: React.CSSProperties = {
  padding: "24px 40px 28px",
  borderTop: `3px solid ${EMAIL_COLORS.fg}`,
  margin: "0 20px 8px",
};

const globalHeadline: React.CSSProperties = {
  color: EMAIL_COLORS.fg,
  fontSize: "22px",
  fontWeight: "700",
  lineHeight: "1.3",
  margin: "0 0 16px",
  textAlign: "left" as const,
};

const globalBody: React.CSSProperties = {
  color: EMAIL_COLORS.fg2,
  fontSize: "15px",
  lineHeight: "1.7",
  margin: "0 0 8px",
  textAlign: "left" as const,
};

const summarySection: React.CSSProperties = {
  padding: "0 40px 24px",
};

const statsTable: React.CSSProperties = {
  width: "100%",
  textAlign: "center" as const,
};

const statCell: React.CSSProperties = {
  padding: "16px",
  backgroundColor: EMAIL_COLORS.surfaceMuted,
  borderRadius: "8px",
  width: "50%",
};

/**
 * Inline (span) variant of statNumber used when the stat sits inside a <Link>
 * wrapper — react-email's <Text> renders a <p>, which is invalid inside <a>.
 */
const statNumberSpan: React.CSSProperties = {
  color: EMAIL_COLORS.primary,
  fontSize: "32px",
  fontWeight: "700",
  lineHeight: "1",
  display: "block",
};

const statDescriptionSpan: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "12px",
  marginTop: "8px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  display: "block",
};

const divider: React.CSSProperties = {
  borderColor: EMAIL_COLORS.border,
  margin: "24px 40px",
};

const companySection: React.CSSProperties = {
  padding: "24px 40px",
  borderBottom: `1px solid ${EMAIL_COLORS.borderSubtle}`,
};

const companyName: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "12px",
  fontWeight: "600",
  margin: "0 0 8px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

const headline: React.CSSProperties = {
  color: EMAIL_COLORS.fg,
  fontSize: "20px",
  fontWeight: "700",
  lineHeight: "1.3",
  margin: "0 0 12px",
};

const bodyText: React.CSSProperties = {
  color: EMAIL_COLORS.fg2,
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 16px",
};

const statsLine: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "12px",
  margin: "0",
  lineHeight: "1.5",
};

const statLabel: React.CSSProperties = {
  fontWeight: "600",
};

const emptySection: React.CSSProperties = {
  padding: "48px 40px",
  textAlign: "center" as const,
};

const emptyText: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "15px",
};

const footer: React.CSSProperties = {
  padding: "24px 40px",
  textAlign: "center" as const,
};

const footerText: React.CSSProperties = {
  margin: "0 0 12px",
};

const footerLink: React.CSSProperties = {
  color: EMAIL_COLORS.primary,
  fontSize: "14px",
  fontWeight: "600",
  textDecoration: "none",
};

const footerMuted: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "12px",
  margin: "0",
};

const footerVersion: React.CSSProperties = {
  color: EMAIL_COLORS.fgFaint,
  fontSize: "11px",
  margin: "8px 0 0",
  textAlign: "center" as const,
};

const footerVersionLink: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "11px",
  textDecoration: "underline",
};

/**
 * Subtle inline underline — keeps the text in the existing typographic scale
 * (color inherits from the parent, gains a muted underline). Used for every
 * structural deep link inside the email body.
 */
const inlineLink: React.CSSProperties = {
  color: "inherit",
  textDecoration: "underline",
  textDecorationColor: EMAIL_COLORS.fgFaint,
  textUnderlineOffset: "2px",
};

/**
 * Big-number stat cells wrap their contents in a Link. We suppress the
 * underline so the cell looks visually identical to a non-linked cell; the
 * clickable affordance comes from the cursor/hover state in email clients
 * that support it.
 */
const statCellLink: React.CSSProperties = {
  color: "inherit",
  textDecoration: "none",
  display: "block",
};

export default WeeklyDigestEmail;
