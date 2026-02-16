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
import type { WeeklyDigest, CompanyWeeklySummary, GlobalSummary, StrategySignal, IndustryTrend } from "@/lib/analysis/digest";

interface WeeklyDigestEmailProps {
  digest: WeeklyDigest;
  digestId: string;  // NEW - for deep linking
  appUrl?: string;
  version?: string;
}

/**
 * Format a date range for display
 */
function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${startDate.toLocaleDateString("en-US", options)} - ${endDate.toLocaleDateString("en-US", options)}, ${endDate.getFullYear()}`;
}

/**
 * Get the primary department focus from department breakdown
 */
function getPrimaryFocus(departments: Record<string, number>): string {
  const entries = Object.entries(departments);
  if (entries.length === 0) return "Various";
  
  // Sort by count and take top department
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

/**
 * Global summary section - the "TL;DR of TL;DRs"
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
          color: "#1a1a2e",
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
 * Company section component
 */
function CompanySection({ company, appUrl = "https://fintech-talent-brief.vercel.app" }: { company: CompanyWeeklySummary; appUrl?: string }) {
  const primaryFocus = getPrimaryFocus(company.departments);
  const techList = company.dominant_tech.slice(0, 3).join(", ") || "Various";
  const companyUrl = `${appUrl}/companies/${company.company_slug}`;

  return (
    <Section style={companySection}>
      {/* Company Name - Clickable */}
      <Link href={companyUrl} style={{ ...companyName, color: "#000", textDecoration: "none" }}>
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
      
      {/* Stats Footer */}
      <Text style={statsLine}>
        <span style={statLabel}>New Jobs:</span> {String(company.new_job_count)} | 
        <span style={statLabel}> Top Tech:</span> {techList} | 
        <span style={statLabel}> Focus:</span> {primaryFocus}
      </Text>
    </Section>
  );
}

/**
 * Weekly Digest Email Template
 * 
 * Clean, minimal design with TLDR-style AI commentary for each company
 */
export function WeeklyDigestEmail({ digest, digestId, appUrl = "https://fintech-talent-brief.vercel.app", version }: WeeklyDigestEmailProps) {
  const dateRange = formatDateRange(digest.week_start, digest.week_end);
  const previewText = `The Fintech Talent Brief: ${digest.total_jobs} new jobs across ${digest.total_companies} companies this week`;
  const digestUrl = `${appUrl}/digests/${digestId}`;

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
              <Link href={digestUrl} style={{
                color: "#6b7280",
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
                    <Text style={statNumber}>{String(digest.total_jobs)}</Text>
                    <Text style={statDescription}>New Jobs</Text>
                  </td>
                  <td style={statCell}>
                    <Text style={statNumber}>{String(digest.total_companies)}</Text>
                    <Text style={statDescription}>Companies</Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Strategy Signals - Key Differentiator */}
          {digest.strategy_signals && Array.isArray(digest.strategy_signals) && digest.strategy_signals.length > 0 && (
            <>
              <Hr style={divider} />
              <Section style={companySection}>
                <Heading as="h2" style={{ fontSize: "18px", fontWeight: "600", marginBottom: "12px" }}>
                  Strategy Signals
                </Heading>
                {digest.strategy_signals.slice(0, 3).map((signal, idx) => (
                  <div key={idx} style={{ marginBottom: "16px", paddingBottom: "16px", borderBottom: idx < Math.min(digest.strategy_signals!.length - 1, 2) ? "1px solid #e5e7eb" : "none" }}>
                    <Text style={{ fontWeight: "600", marginBottom: "4px" }}>
                      {signal.company}
                    </Text>
                    <Text style={{ fontSize: "14px", color: "#6b7280", marginBottom: "8px" }}>
                      {signal.signal}
                    </Text>
                    <Text style={{ fontSize: "13px", color: "#374151" }}>
                      {signal.interpretation}
                    </Text>
                  </div>
                ))}
                {digest.strategy_signals.length > 3 && (
                  <Text style={{ fontSize: "12px", color: "#6b7280", marginTop: "8px" }}>
                    +{digest.strategy_signals.length - 3} more signals in full digest
                  </Text>
                )}
              </Section>
            </>
          )}

          {/* Hiring Activity */}
          {digest.industry_trends && Array.isArray(digest.industry_trends) && digest.industry_trends.length > 0 && (
            <>
              <Hr style={divider} />
              <Section style={companySection}>
                <Heading as="h2" style={{ fontSize: "18px", fontWeight: "600", marginBottom: "4px" }}>
                  Hiring Activity
                </Heading>
                <Text style={{ fontSize: "13px", color: "#6b7280", marginBottom: "12px" }}>
                  Department activity across tracked companies this week
                </Text>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "6px 8px 6px 0", fontWeight: "600", color: "#6b7280" }}>Dept</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: "600", color: "#6b7280" }}>Roles</th>
                      <th style={{ textAlign: "left", padding: "6px 0 6px 8px", fontWeight: "600", color: "#6b7280" }}>Companies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {digest.industry_trends.slice(0, 5).map((trend, idx) => (
                      <tr key={idx} style={{ borderBottom: idx < Math.min(digest.industry_trends!.length - 1, 4) ? "1px solid #f3f4f6" : "none" }}>
                        <td style={{ padding: "8px 8px 8px 0", fontWeight: "500" }}>
                          {trend.trend.replace(/ hiring surge$/, "").replace(/ adoption$/, "")}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {String(trend.jobCount)}
                        </td>
                        <td style={{ padding: "8px 0 8px 8px", color: "#6b7280" }}>
                          {trend.companies.join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            </>
          )}

          <Hr style={divider} />

          {/* Company Sections */}
          {digest.companies.map((company) => (
            <CompanySection key={company.company_id} company={company} appUrl={appUrl} />
          ))}

          {/* No companies message */}
          {digest.companies.length === 0 && (
            <Section style={emptySection}>
              <Text style={emptyText}>
                No new job postings this week. Check back next Monday!
              </Text>
            </Section>
          )}

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              <Link href={digestUrl} style={footerLink}>
                View full digest in app →
              </Link>
            </Text>
            <Text style={footerMuted}>
              The Fintech Talent Brief | Hiring Intelligence for Fintech
            </Text>
            {version && (
              <Text style={footerVersion}>
                v{version}
                {" \u2013 "}
                <Link href={`${appUrl}/releases`} style={footerVersionLink}>
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
  backgroundColor: "#f6f9fc",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "600px",
};

const header: React.CSSProperties = {
  padding: "32px 40px 24px",
  textAlign: "center" as const,
};

const title: React.CSSProperties = {
  color: "#1a1a2e",
  fontSize: "28px",
  fontWeight: "700",
  lineHeight: "1.2",
  margin: "0 0 8px",
};

const subtitle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "14px",
  margin: "0",
};

const globalSummarySection: React.CSSProperties = {
  padding: "24px 40px 28px",
  borderTop: "3px solid #1a1a2e",
  margin: "0 20px 8px",
};

const globalHeadline: React.CSSProperties = {
  color: "#1a1a2e",
  fontSize: "22px",
  fontWeight: "700",
  lineHeight: "1.3",
  margin: "0 0 16px",
  textAlign: "left" as const,
};

const globalBody: React.CSSProperties = {
  color: "#374151",
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
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  width: "50%",
};

const statNumber: React.CSSProperties = {
  color: "#4a69bd",
  fontSize: "32px",
  fontWeight: "700",
  margin: "0",
  lineHeight: "1",
};

const statDescription: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "12px",
  margin: "8px 0 0",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

const divider: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "24px 40px",
};

const companySection: React.CSSProperties = {
  padding: "24px 40px",
  borderBottom: "1px solid #f3f4f6",
};

const companyName: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
  fontWeight: "600",
  margin: "0 0 8px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

const headline: React.CSSProperties = {
  color: "#1a1a2e",
  fontSize: "20px",
  fontWeight: "700",
  lineHeight: "1.3",
  margin: "0 0 12px",
};

const bodyText: React.CSSProperties = {
  color: "#4b5563",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 16px",
};

const statsLine: React.CSSProperties = {
  color: "#9ca3af",
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
  color: "#6b7280",
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
  color: "#4a69bd",
  fontSize: "14px",
  fontWeight: "600",
  textDecoration: "none",
};

const footerMuted: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
  margin: "0",
};

const footerVersion: React.CSSProperties = {
  color: "#c0c0c0",
  fontSize: "11px",
  margin: "8px 0 0",
  textAlign: "center" as const,
};

const footerVersionLink: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "11px",
  textDecoration: "underline",
};

export default WeeklyDigestEmail;
