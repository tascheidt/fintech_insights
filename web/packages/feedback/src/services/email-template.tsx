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
import { EMAIL_COLORS } from "../../../../lib/email/colors";

interface FeedbackNotificationEmailProps {
  feedbackTitle: string;
  feedbackType: string;
  feedbackDescription: string;
  submittedBy: string;
  pageUrl?: string;
  appName: string;
  appUrl: string;
  adminPanelPath?: string;
}

const TYPE_LABELS: Record<string, string> = {
  feature: "Feature Request",
  bug: "Bug Report",
  improvement: "Improvement",
  general: "General",
};

export function FeedbackNotificationEmail({
  feedbackTitle,
  feedbackType,
  feedbackDescription,
  submittedBy,
  pageUrl,
  appName,
  appUrl,
  adminPanelPath = "/admin",
}: FeedbackNotificationEmailProps) {
  const typeLabel = TYPE_LABELS[feedbackType] || feedbackType;
  const adminUrl = `${appUrl}${adminPanelPath}`;

  return (
    <Html>
      <Head />
      <Preview>New feedback: {feedbackTitle}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={title}>New Feedback Submitted</Heading>
            <Text style={subtitle}>{appName}</Text>
          </Section>

          <Hr style={divider} />

          <Section style={content}>
            <Text style={typeTag}>{typeLabel}</Text>
            <Heading as="h2" style={feedbackTitleStyle}>
              {feedbackTitle}
            </Heading>
            <Text style={body}>{feedbackDescription}</Text>

            <Text style={meta}>
              Submitted by: {submittedBy}
              {pageUrl ? ` from ${pageUrl}` : ""}
            </Text>
          </Section>

          <Hr style={divider} />

          <Section style={ctaSection}>
            <Text style={body}>
              AI triage is processing this submission. Review it in the admin
              panel:
            </Text>
            <Link href={adminUrl} style={ctaLink}>
              Open Admin Panel
            </Link>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              You received this because you are an admin of {appName}.
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

const typeTag: React.CSSProperties = {
  color: EMAIL_COLORS.primary,
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 8px",
};

const feedbackTitleStyle: React.CSSProperties = {
  color: EMAIL_COLORS.fg,
  fontSize: "18px",
  fontWeight: "600",
  lineHeight: "1.4",
  margin: "0 0 12px",
};

const body: React.CSSProperties = {
  color: EMAIL_COLORS.fg2,
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 8px",
};

const meta: React.CSSProperties = {
  color: EMAIL_COLORS.fgMuted,
  fontSize: "12px",
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
