/**
 * Resend rejects many placeholder / test recipient domains. See:
 * https://resend.com/docs/dashboard/emails/send-test-emails
 */
const BLOCKED_TO_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "localhost",
]);

export function isLikelyResendBlockedRecipientEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return BLOCKED_TO_DOMAINS.has(domain);
}
