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
import { EMAIL_COLORS } from "@/lib/email/colors";

export interface ScraperIssue {
  companyName: string;
  companySlug: string;
  issueType: "failed" | "empty";
  errorMessage?: string;
  activeJobCount: number;
  closedThisRun: number;
}

interface ScraperAlertEmailProps {
  issues: ScraperIssue[];
  jobRunId: string;
  appUrl?: string;
}

const ISSUE_LABELS: Record<ScraperIssue["issueType"], string> = {
  failed: "Scrape error",
  empty: "Zero jobs returned",
};

export function ScraperAlertEmail({
  issues,
  jobRunId,
  appUrl = "https://fintech-talent-brief.vercel.app",
}: ScraperAlertEmailProps) {
  const adminUrl = `${appUrl}/admin`;
  const subject =
    issues.length === 1
      ? `Scraper alert: ${issues[0].companyName} — ${ISSUE_LABELS[issues[0].issueType]}`
      : `Scraper alert: ${issues.length} companies need attention`;

  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={title}>Scraper Health Alert</Heading>
            <Text style={subtitle}>The Fintech Talent Brief</Text>
          </Section>

          <Hr style={divider} />

          <Section style={content}>
            <Text style={body}>
              {issues.length === 1
                ? "1 company had a collection issue in the latest run."
                : `${issues.length} companies had collection issues in the latest run.`}{" "}
              Review and fix to ensure data stays accurate.
            </Text>

            {issues.map((issue) => (
              <Section key={issue.companySlug} style={issueCard}>
                <Text style={companyName}>{issue.companyName}</Text>
                <Text
                  style={
                    issue.issueType === "failed" ? tagError : tagWarning
                  }
                >
                  {ISSUE_LABELS[issue.issueType]}
                </Text>
                {issue.issueType === "empty" && (
                  <Text style={detail}>
                    Scraper returned 0 jobs —{" "}
                    <strong>{issue.closedThisRun} role(s)</strong> were closed
                    as a result. Active count is now{" "}
                    <strong>0</strong>.
                  </Text>
                )}
                {issue.issueType === "failed" && issue.errorMessage && (
                  <Text style={errorText}>{issue.errorMessage}</Text>
                )}
                {issue.issueType === "failed" && (
                  <Text style={detail}>
                    Active job count: <strong>{issue.activeJobCount}</strong>
                  </Text>
                )}
              </Section>
            ))}

            <Text style={metaText}>Job run ID: {jobRunId}</Text>
          </Section>

          <Hr style={divider} />

          <Section style={ctaSection}>
            <Link href={adminUrl} style={ctaLink}>
              Open Admin Panel
            </Link>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              You received this because you are an admin of The Fintech Talent
              Brief.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main: React.CSSProperties = {
  backgroundColor: EMAIL_COLORS.bg,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container: React.CSSProperties = {
  backgroundColor: EMAIL_COLORS.surface,
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "600px",
};

const header: React.CSSProperties = {
  padding: "32px 40px 16px",
  textAlign: "center" as const,
};

const title: React.CSSProperties = {
  color: EMAIL_COLORS.fg,
  fontSize: "22px",
  fontWeight: "700",
  lineHeight: "1.2",
  margin: "0 0 4px",
};

const subtitle: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "13px",
  margin: "0",
};

const divider: React.CSSProperties = {
  borderColor: EMAIL_COLORS.border,
  margin: "16px 40px",
};

const content: React.CSSProperties = {
  padding: "8px 40px 16px",
};

const body: React.CSSProperties = {
  color: EMAIL_COLORS.fg2,
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 16px",
};

const issueCard: React.CSSProperties = {
  backgroundColor: EMAIL_COLORS.surfaceMuted,
  borderLeft: `3px solid ${EMAIL_COLORS.danger}`,
  padding: "12px 16px",
  marginBottom: "12px",
  borderRadius: "0 6px 6px 0",
};

const companyName: React.CSSProperties = {
  color: EMAIL_COLORS.fg,
  fontSize: "15px",
  fontWeight: "600",
  margin: "0 0 4px",
};

const tagError: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: EMAIL_COLORS.dangerSoft,
  color: EMAIL_COLORS.dangerSoftFg,
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  padding: "2px 6px",
  borderRadius: "4px",
  margin: "0 0 6px",
};

const tagWarning: React.CSSProperties = {
  ...tagError,
  backgroundColor: EMAIL_COLORS.accentSoft,
  color: EMAIL_COLORS.accentSoftFg,
};

const detail: React.CSSProperties = {
  color: EMAIL_COLORS.fg2,
  fontSize: "13px",
  margin: "4px 0 0",
};

const errorText: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "12px",
  fontFamily: "monospace",
  backgroundColor: EMAIL_COLORS.borderSubtle,
  padding: "6px 8px",
  borderRadius: "4px",
  margin: "4px 0 0",
};

const metaText: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "11px",
  margin: "16px 0 0",
};

const ctaSection: React.CSSProperties = {
  padding: "8px 40px 16px",
};

const ctaLink: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: EMAIL_COLORS.fg,
  color: EMAIL_COLORS.surface,
  fontSize: "13px",
  fontWeight: "600",
  padding: "10px 20px",
  borderRadius: "6px",
  textDecoration: "none",
  marginTop: "8px",
};

const footer: React.CSSProperties = {
  padding: "16px 40px 0",
};

const footerText: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "11px",
  textAlign: "center" as const,
  margin: "0",
};
