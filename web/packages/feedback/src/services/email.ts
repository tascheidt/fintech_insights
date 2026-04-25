import type { ResolvedFeedbackConfig } from "../types";
import { retryResendCall } from "./resend-retry";
import { FeedbackNotificationEmail } from "./email-template";

interface FeedbackNotification {
  title: string;
  type: string;
  description: string;
  submittedByEmail: string;
  pageUrl?: string;
}

/**
 * Send email notification to all admin users when new feedback is submitted.
 * Non-fatal — errors are logged but do not propagate.
 */
export async function notifyAdminsOfNewFeedback(
  config: ResolvedFeedbackConfig,
  feedback: FeedbackNotification
): Promise<void> {
  if (!config.email) {
    console.warn("Email config not provided, skipping admin notification");
    return;
  }

  const { resendApiKey, fromAddress, adminPanelPath } = config.email;

  try {
    // Dynamic import so resend is only loaded when email is configured
    const { Resend } = await import("resend");
    const supabase = config.createAdminClient();

    const { data: admins } = await supabase
      .from(config.userTable)
      .select(config.userEmailColumn)
      .eq(config.userRoleColumn, config.adminRoleValue)
      .not(config.userEmailColumn, "is", null);

    const adminEmails = (admins ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((a) => (a as any)[config.userEmailColumn])
      .filter((e): e is string => typeof e === "string" && e.length > 0);

    if (adminEmails.length === 0) {
      console.warn("No admin users found for feedback notification");
      return;
    }

    const resend = new Resend(resendApiKey);

    const emails = adminEmails.map((email) => ({
      from: fromAddress,
      to: email,
      subject: `New feedback: ${feedback.title}`,
      react: FeedbackNotificationEmail({
        feedbackTitle: feedback.title,
        feedbackType: feedback.type,
        feedbackDescription: feedback.description,
        submittedBy: feedback.submittedByEmail,
        pageUrl: feedback.pageUrl,
        appName: config.appName,
        appUrl: config.appUrl,
        adminPanelPath,
      }),
    }));

    // Resend batch send is wrapped with retryResendCall (3 attempts,
    // exponential backoff). Notification is non-fatal: even after retries
    // fail we just log and return, matching the original semantics.
    const outcome = await retryResendCall(
      () => resend.batch.send(emails),
      { label: "feedback_admin_notification", maxAttempts: 3, baseMs: 1000 }
    );
    if (!outcome.ok) {
      console.error(
        "Resend batch error (admin notification, after retries):",
        outcome.error
      );
      return;
    }
    console.log(
      `Admin notification sent to ${adminEmails.length} admin(s) on attempt ${outcome.attempts}`
    );
  } catch (err) {
    console.error("Failed to send admin feedback notification:", err);
  }
}
