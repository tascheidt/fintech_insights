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

/**
 * Fragility canary — fired when an incumbent scraper shows a >50% drop in
 * new postings versus its 7-day rolling average. Distinct from `issues`
 * because the scraper itself did not error: it just returned less than
 * expected. See `lib/email/scraper-health.ts#detectIncumbentCanaries`.
 */
export interface ScraperCanary {
  companyName: string;
  companySlug: string;
  todayNewJobs: number;
  rollingAvg7d: number;
  explanation: string;
}

/**
 * Staleness watchdog entry — an active company that has gone 7+ days with no
 * successful scrape (`stale_scrape`) or currently has zero active postings
 * (`no_active_jobs`). Unlike `issues`, these re-fire in every daily email
 * until fixed. See `lib/email/scraper-health.ts#detectStaleCompanies`.
 */
export interface StaleCompanyIssue {
  companyName: string;
  companySlug: string;
  kind: "stale_scrape" | "no_active_jobs";
  daysSinceLastSuccess: number | null;
  activeJobCount: number;
  explanation: string;
}

interface ScraperAlertEmailProps {
  issues: ScraperIssue[];
  canaries?: ScraperCanary[];
  staleIssues?: StaleCompanyIssue[];
  jobRunId: string;
  appUrl?: string;
}

const STALE_LABELS: Record<StaleCompanyIssue["kind"], string> = {
  stale_scrape: "No successful scrape in 7+ days",
  no_active_jobs: "Zero active postings",
};

const ISSUE_LABELS: Record<ScraperIssue["issueType"], string> = {
  failed: "Scrape error",
  empty: "Zero jobs returned",
};

export function ScraperAlertEmail({
  issues,
  canaries = [],
  staleIssues = [],
  jobRunId,
  appUrl = "https://fintech-talent-brief.vercel.app",
}: ScraperAlertEmailProps) {
  const adminUrl = `${appUrl}/admin`;
  const totalCount = issues.length + canaries.length + staleIssues.length;
  const subject = (() => {
    if (issues.length === 0 && canaries.length === 0 && staleIssues.length > 0) {
      return staleIssues.length === 1
        ? `Stale scraper: ${staleIssues[0].companyName}`
        : `Stale scrapers: ${staleIssues.length} companies`;
    }
    if (issues.length === 0 && canaries.length > 0 && staleIssues.length === 0) {
      return canaries.length === 1
        ? `Scraper-break canary: ${canaries[0].companyName}`
        : `Scraper-break canary: ${canaries.length} incumbent scrapers`;
    }
    if (issues.length === 1 && canaries.length === 0 && staleIssues.length === 0) {
      return `Scraper alert: ${issues[0].companyName} — ${ISSUE_LABELS[issues[0].issueType]}`;
    }
    return `Scraper alert: ${totalCount} ${totalCount === 1 ? "issue" : "issues"} need attention`;
  })();

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
            {issues.length > 0 && (
              <>
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
                        <strong>{issue.closedThisRun} role(s)</strong> were
                        closed as a result. Active count is now{" "}
                        <strong>0</strong>.
                      </Text>
                    )}
                    {issue.issueType === "failed" && issue.errorMessage && (
                      <Text style={errorText}>{issue.errorMessage}</Text>
                    )}
                    {issue.issueType === "failed" && (
                      <Text style={detail}>
                        Active job count:{" "}
                        <strong>{issue.activeJobCount}</strong>
                      </Text>
                    )}
                  </Section>
                ))}
              </>
            )}

            {canaries.length > 0 && (
              <>
                <Text style={canaryHeading}>Scraper-break canary</Text>
                <Text style={body}>
                  {canaries.length === 1
                    ? "1 incumbent scraper is showing a partial-corpus drop today."
                    : `${canaries.length} incumbent scrapers are showing partial-corpus drops today.`}{" "}
                  Silent partial drops are scarier than outages — confirm
                  pagination, location filters, and site sections still
                  resolve.
                </Text>

                {canaries.map((canary) => (
                  <Section key={canary.companySlug} style={canaryCard}>
                    <Text style={companyName}>{canary.companyName}</Text>
                    <Text style={tagCanary}>Partial corpus drop</Text>
                    <Text style={detail}>
                      Today: <strong>{canary.todayNewJobs}</strong> new — 7-day
                      avg: <strong>{canary.rollingAvg7d.toFixed(1)}/day</strong>
                    </Text>
                    <Text style={detail}>{canary.explanation}</Text>
                  </Section>
                ))}
              </>
            )}

            {staleIssues.length > 0 && (
              <>
                <Text style={canaryHeading}>Staleness watchdog</Text>
                <Text style={body}>
                  {staleIssues.length === 1
                    ? "1 active company has gone stale."
                    : `${staleIssues.length} active companies have gone stale.`}{" "}
                  These re-fire daily until the company is fixed or
                  deactivated with a reason — a stale company usually means
                  its board moved to a different ATS.
                </Text>

                {staleIssues.map((stale) => (
                  <Section
                    key={`${stale.companySlug}-${stale.kind}`}
                    style={canaryCard}
                  >
                    <Text style={companyName}>{stale.companyName}</Text>
                    <Text style={tagCanary}>{STALE_LABELS[stale.kind]}</Text>
                    <Text style={detail}>
                      Last successful scrape:{" "}
                      <strong>
                        {stale.daysSinceLastSuccess === null
                          ? "never"
                          : `${stale.daysSinceLastSuccess} day(s) ago`}
                      </strong>{" "}
                      — active postings:{" "}
                      <strong>{stale.activeJobCount}</strong>
                    </Text>
                    <Text style={detail}>{stale.explanation}</Text>
                  </Section>
                ))}
              </>
            )}

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

const tagCanary: React.CSSProperties = {
  ...tagError,
  backgroundColor: EMAIL_COLORS.highlightSoft,
  color: EMAIL_COLORS.highlightSoftFg,
};

const canaryHeading: React.CSSProperties = {
  color: EMAIL_COLORS.fg,
  fontSize: "15px",
  fontWeight: "700",
  margin: "24px 0 8px",
  letterSpacing: "0.2px",
};

const canaryCard: React.CSSProperties = {
  backgroundColor: EMAIL_COLORS.surfaceMuted,
  borderLeft: `3px solid ${EMAIL_COLORS.highlight}`,
  padding: "12px 16px",
  marginBottom: "12px",
  borderRadius: "0 6px 6px 0",
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
