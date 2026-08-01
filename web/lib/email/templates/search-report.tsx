/**
 * Search-report email.
 *
 * Sent by one user to a colleague from the Jobs page. Unlike the weekly
 * digest, the recipient is usually NOT a Fintech Talent Brief user — the whole
 * point of the share link is that they can read the report without an account.
 * So this template leads with the sender's note, gives the AI synthesis and a
 * trimmed table inline (enough to judge whether to click), and sends them to
 * the full report for the rest.
 *
 * Job titles are deliberately NOT linked here. `/jobs/[id]` is behind auth;
 * an unauthenticated recipient clicking a row would land on the login screen
 * with no explanation. The single CTA goes to the public report, which then
 * offers sign-in for the deeper surfaces.
 */

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
  Row,
  Column,
} from "@react-email/components";
import { EMAIL_COLORS } from "@/lib/email/colors";
import {
  MAX_EMAIL_TABLE_ROWS,
  describeSearchContext,
  formatReportDate,
  type SharedReport,
} from "@/lib/reports/types";

interface SearchReportEmailProps {
  report: SharedReport;
  reportUrl: string;
  /** Sender's display name — used in the "X shared a report" line. */
  senderLabel: string;
}

export function SearchReportEmail({
  report,
  reportUrl,
  senderLabel,
}: SearchReportEmailProps) {
  const rows = report.jobs.slice(0, MAX_EMAIL_TABLE_ROWS);
  const remaining = report.jobs.length - rows.length;
  const synthesis = report.synthesis;

  return (
    <Html>
      <Head />
      <Preview>{`${senderLabel} shared a hiring report: ${report.title}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={eyebrow}>The Fintech Talent Brief</Text>
            <Heading style={title}>{report.title}</Heading>
            <Text style={subtitle}>
              {senderLabel} shared this with you · {formatReportDate(report.createdAt)}
            </Text>
          </Section>

          {report.commentary && (
            <Section style={commentarySection}>
              <Text style={commentaryLabel}>Note from {senderLabel}</Text>
              <Text style={commentaryText}>{report.commentary}</Text>
            </Section>
          )}

          {synthesis && (
            <Section style={synthesisSection}>
              <Heading as="h2" style={synthesisHeadline}>
                {synthesis.headline}
              </Heading>
              <Text style={synthesisBody}>{synthesis.summary}</Text>

              {synthesis.roleGroups.length > 0 && (
                <>
                  <Text style={blockLabel}>What&apos;s in this set</Text>
                  {synthesis.roleGroups.map((group) => (
                    <Text key={group.label} style={groupText}>
                      <span style={groupLabel}>{group.label}</span>
                      <span style={groupCount}> · {group.count}</span>
                      <br />
                      {group.detail}
                    </Text>
                  ))}
                </>
              )}

              {synthesis.commonRequirements.length > 0 && (
                <Text style={requirementsText}>
                  <span style={blockLabelInline}>Recurring requirements: </span>
                  {synthesis.commonRequirements.join(" · ")}
                </Text>
              )}
            </Section>
          )}

          <Hr style={divider} />

          <Section style={tableSection}>
            <Text style={blockLabel}>
              {report.jobCount} {report.jobCount === 1 ? "role" : "roles"}
            </Text>
            <Text style={provenance}>{describeSearchContext(report.searchContext)}</Text>

            {rows.map((job) => (
              <Row key={job.id} style={jobRow}>
                <Column>
                  <Text style={jobTitle}>{job.title}</Text>
                  <Text style={jobMeta}>
                    {job.companyName}
                    {job.location ? ` · ${job.location}` : ""}
                    {job.functionGroup ? ` · ${job.functionGroup}` : ""}
                  </Text>
                </Column>
                <Column style={jobDateColumn}>
                  <Text style={jobDate}>{formatReportDate(job.firstSeenDate)}</Text>
                </Column>
              </Row>
            ))}

            {remaining > 0 && (
              <Text style={moreText}>
                + {remaining} more {remaining === 1 ? "role" : "roles"} in the full report
              </Text>
            )}
          </Section>

          <Section style={ctaSection}>
            <Link href={reportUrl} style={ctaButton}>
              View the full report
            </Link>
            <Text style={ctaNote}>No account needed to read it.</Text>
          </Section>

          <Hr style={divider} />

          <Section style={footer}>
            <Text style={footerMuted}>
              The Fintech Talent Brief | Hiring Intelligence for Fintech
            </Text>
            <Text style={footerFaint}>
              You received this because {senderLabel} sent it to you directly.
              This is not a subscription.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default SearchReportEmail;

// ============================================================================
// Styles
// ============================================================================

const main: React.CSSProperties = {
  backgroundColor: EMAIL_COLORS.bg,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container: React.CSSProperties = {
  backgroundColor: EMAIL_COLORS.surface,
  margin: "0 auto",
  padding: "20px 0 40px",
  maxWidth: "600px",
};

const header: React.CSSProperties = {
  padding: "28px 40px 16px",
};

const eyebrow: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "11px",
  fontWeight: "600",
  letterSpacing: "0.6px",
  textTransform: "uppercase" as const,
  margin: "0 0 10px",
};

const title: React.CSSProperties = {
  color: EMAIL_COLORS.fg,
  fontSize: "26px",
  fontWeight: "700",
  lineHeight: "1.2",
  margin: "0 0 8px",
};

const subtitle: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "13px",
  margin: "0",
};

const commentarySection: React.CSSProperties = {
  margin: "8px 40px 0",
  padding: "16px 18px",
  backgroundColor: EMAIL_COLORS.primarySoft,
  borderRadius: "8px",
};

const commentaryLabel: React.CSSProperties = {
  color: EMAIL_COLORS.primarySoftFg,
  fontSize: "11px",
  fontWeight: "600",
  letterSpacing: "0.4px",
  textTransform: "uppercase" as const,
  margin: "0 0 6px",
};

const commentaryText: React.CSSProperties = {
  color: EMAIL_COLORS.fg1,
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0",
  whiteSpace: "pre-wrap" as const,
};

const synthesisSection: React.CSSProperties = {
  padding: "24px 40px 8px",
};

const synthesisHeadline: React.CSSProperties = {
  color: EMAIL_COLORS.fg,
  fontSize: "20px",
  fontWeight: "700",
  lineHeight: "1.3",
  margin: "0 0 12px",
};

const synthesisBody: React.CSSProperties = {
  color: EMAIL_COLORS.fg2,
  fontSize: "15px",
  lineHeight: "1.65",
  margin: "0 0 20px",
};

const blockLabel: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "11px",
  fontWeight: "600",
  letterSpacing: "0.5px",
  textTransform: "uppercase" as const,
  margin: "0 0 10px",
};

const blockLabelInline: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontWeight: "600",
};

const groupText: React.CSSProperties = {
  color: EMAIL_COLORS.fg2,
  fontSize: "14px",
  lineHeight: "1.55",
  margin: "0 0 12px",
};

const groupLabel: React.CSSProperties = {
  color: EMAIL_COLORS.fg,
  fontWeight: "600",
};

const groupCount: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
};

const requirementsText: React.CSSProperties = {
  color: EMAIL_COLORS.fg2,
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "8px 0 0",
};

const divider: React.CSSProperties = {
  borderColor: EMAIL_COLORS.border,
  margin: "20px 40px",
};

const tableSection: React.CSSProperties = {
  padding: "0 40px",
};

const provenance: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "12px",
  margin: "0 0 16px",
};

const jobRow: React.CSSProperties = {
  borderBottom: `1px solid ${EMAIL_COLORS.borderSubtle}`,
};

const jobTitle: React.CSSProperties = {
  color: EMAIL_COLORS.fg,
  fontSize: "14px",
  fontWeight: "600",
  lineHeight: "1.4",
  margin: "10px 0 2px",
};

const jobMeta: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "12px",
  lineHeight: "1.4",
  margin: "0 0 10px",
};

const jobDateColumn: React.CSSProperties = {
  width: "90px",
  textAlign: "right" as const,
  verticalAlign: "top" as const,
};

const jobDate: React.CSSProperties = {
  color: EMAIL_COLORS.fgFaint,
  fontSize: "11px",
  margin: "10px 0 0",
};

const moreText: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "13px",
  margin: "14px 0 0",
};

const ctaSection: React.CSSProperties = {
  padding: "24px 40px 8px",
  textAlign: "center" as const,
};

const ctaButton: React.CSSProperties = {
  backgroundColor: EMAIL_COLORS.primary,
  borderRadius: "8px",
  color: EMAIL_COLORS.surface,
  display: "inline-block",
  fontSize: "14px",
  fontWeight: "600",
  padding: "12px 22px",
  textDecoration: "none",
};

const ctaNote: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "12px",
  margin: "12px 0 0",
};

const footer: React.CSSProperties = {
  padding: "0 40px",
  textAlign: "center" as const,
};

const footerMuted: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "12px",
  margin: "0 0 8px",
};

const footerFaint: React.CSSProperties = {
  color: EMAIL_COLORS.fgFaint,
  fontSize: "11px",
  lineHeight: "1.5",
  margin: "0",
};
