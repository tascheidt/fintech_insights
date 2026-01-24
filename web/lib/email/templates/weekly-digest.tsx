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
import type { WeeklyDigest, CompanyWeeklySummary } from "@/lib/analysis/digest";

interface WeeklyDigestEmailProps {
  digest: WeeklyDigest;
  appUrl?: string;
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
 * Company section component
 */
function CompanySection({ company }: { company: CompanyWeeklySummary }) {
  const primaryFocus = getPrimaryFocus(company.departments);
  const techList = company.dominant_tech.slice(0, 3).join(", ") || "Various";

  return (
    <Section style={companySection}>
      {/* Company Name */}
      <Text style={companyName}>{company.company_name}</Text>
      
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
export function WeeklyDigestEmail({ digest, appUrl = "https://fintech-insights.vercel.app" }: WeeklyDigestEmailProps) {
  const dateRange = formatDateRange(digest.week_start, digest.week_end);
  const previewText = `Fintech Insights: ${digest.total_jobs} new jobs across ${digest.total_companies} companies this week`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading as="h1" style={title}>
              Fintech Insights TLDR
            </Heading>
            <Text style={subtitle}>
              {dateRange}
            </Text>
          </Section>

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

          <Hr style={divider} />

          {/* Company Sections */}
          {digest.companies.map((company) => (
            <CompanySection key={company.company_id} company={company} />
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
              <Link href={appUrl} style={footerLink}>
                View full dashboard →
              </Link>
            </Text>
            <Text style={footerMuted}>
              Fintech Insights | Competitive Intelligence Platform
            </Text>
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

export default WeeklyDigestEmail;
