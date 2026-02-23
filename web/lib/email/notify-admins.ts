import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { FeedbackNotificationEmail } from "./templates/feedback-notification";

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
export async function notifyAdminsOfNewFeedback(feedback: FeedbackNotification): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("RESEND_API_KEY not set, skipping admin notification");
    return;
  }

  try {
    const supabase = createAdminClient();

    const { data: admins } = await supabase
      .from("profiles")
      .select("email")
      .eq("role", "admin")
      .not("email", "is", null);

    const adminEmails = (admins ?? [])
      .map((a) => a.email)
      .filter((e): e is string => Boolean(e));

    if (adminEmails.length === 0) {
      console.warn("No admin users found for feedback notification");
      return;
    }

    const resend = new Resend(resendKey);
    const from = process.env.RESEND_FROM || "onboarding@resend.dev";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fintech-talent-brief.vercel.app";

    const emails = adminEmails.map((email) => ({
      from,
      to: email,
      subject: `New feedback: ${feedback.title}`,
      react: FeedbackNotificationEmail({
        feedbackTitle: feedback.title,
        feedbackType: feedback.type,
        feedbackDescription: feedback.description,
        submittedBy: feedback.submittedByEmail,
        pageUrl: feedback.pageUrl,
        appUrl,
      }),
    }));

    await resend.batch.send(emails);
    console.log(`Admin notification sent to ${adminEmails.length} admin(s)`);
  } catch (err) {
    console.error("Failed to send admin feedback notification:", err);
  }
}
