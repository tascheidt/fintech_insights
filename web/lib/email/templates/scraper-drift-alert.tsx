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
import type { DriftFinding } from "@/lib/scrapers/drift";

/**
 * Weekly scraper-drift alert — sent by `scripts/scraper-drift-check.ts` when
 * a company's ATS config no longer matches reality: an inactive company
 * whose board is live somewhere (`dormant_live_board`), an active company
 * whose careers_url resolves to a different provider (`ats_drift`), or an
 * active company whose configured endpoint died (`dead_config`).
 */

export type DriftAlertFinding = DriftFinding & {
  companyName: string;
  companySlug: string;
};

interface ScraperDriftAlertEmailProps {
  findings: DriftAlertFinding[];
  appUrl?: string;
}

const KIND_LABELS: Record<DriftFinding["kind"], string> = {
  dormant_live_board: "Deactivated, but board is live",
  ats_drift: "ATS config drift",
  dead_config: "Configured board is dead",
};

export function ScraperDriftAlertEmail({
  findings,
  appUrl = "https://fintech-talent-brief.vercel.app",
}: ScraperDriftAlertEmailProps) {
  const adminUrl = `${appUrl}/admin`;
  const preview =
    findings.length === 1
      ? `Scraper drift: ${findings[0].companyName}`
      : `Scraper drift: ${findings.length} findings`;

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={title}>Scraper Drift Check</Heading>
            <Text style={subtitle}>The Fintech Talent Brief</Text>
          </Section>

          <Hr style={divider} />

          <Section style={content}>
            <Text style={body}>
              The weekly sweep compared every company&apos;s stored ATS config
              against its live careers surface.{" "}
              {findings.length === 1
                ? "1 company needs attention."
                : `${findings.length} companies need attention.`}
            </Text>

            {findings.map((finding) => (
              <Section
                key={`${finding.companySlug}-${finding.kind}`}
                style={findingCard}
              >
                <Text style={companyName}>{finding.companyName}</Text>
                <Text style={tag}>{KIND_LABELS[finding.kind]}</Text>
                <Text style={detail}>
                  Configured: <strong>{finding.configured}</strong>
                  {finding.detected && (
                    <>
                      {" "}
                      — found: <strong>{finding.detected}</strong>
                    </>
                  )}
                </Text>
                {finding.deactivatedReason && (
                  <Text style={detail}>
                    Deactivation reason on file:{" "}
                    <strong>{finding.deactivatedReason}</strong>
                  </Text>
                )}
                <Text style={detail}>{finding.detail}</Text>
              </Section>
            ))}
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

const findingCard: React.CSSProperties = {
  backgroundColor: EMAIL_COLORS.surfaceMuted,
  borderLeft: `3px solid ${EMAIL_COLORS.highlight}`,
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

const tag: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: EMAIL_COLORS.highlightSoft,
  color: EMAIL_COLORS.highlightSoftFg,
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  padding: "2px 6px",
  borderRadius: "4px",
  margin: "0 0 6px",
};

const detail: React.CSSProperties = {
  color: EMAIL_COLORS.fg2,
  fontSize: "13px",
  margin: "4px 0 0",
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
