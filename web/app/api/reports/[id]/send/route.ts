/**
 * POST /api/reports/[id]/send — email a shared report to named recipients.
 *
 * This is the one place in the app where a signed-in user can cause mail to be
 * sent to an address of their choosing, so it is deliberately narrow:
 *   - owner-only (checked in the query; a non-owner gets 404, not 403);
 *   - at most MAX_REPORT_RECIPIENTS addresses per call;
 *   - the body is entirely server-rendered from the stored report — the
 *     request carries no HTML, no subject, and no free-form sender identity;
 *   - `replyTo` is the sender's own verified account email, so a recipient
 *     replies to a real person rather than to the no-reply address.
 *
 * Title / commentary edits are applied before sending so "write a note, then
 * send" is one round trip and the link's content matches what was mailed.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { requireUser } from "@/lib/auth/guards";
import { retryResendCall } from "@/lib/email/resend-retry";
import { getEmailBaseUrl } from "@/lib/email/links";
import { SearchReportEmail } from "@/lib/email/templates/search-report";
import {
  getOwnedReport,
  recordReportSend,
  updateOwnedReport,
} from "@/lib/reports/store";
import {
  MAX_REPORT_RECIPIENTS,
  buildReportUrl,
  isLikelyEmail,
} from "@/lib/reports/types";
import { log } from "@/lib/log";

const SendSchema = z.object({
  recipients: z
    .array(z.string().min(3).max(320))
    .min(1)
    .max(MAX_REPORT_RECIPIENTS),
  title: z.string().min(1).max(160).optional(),
  commentary: z.string().max(2000).nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const recipients = Array.from(
    new Set(parsed.data.recipients.map((r) => r.trim().toLowerCase()))
  );
  const invalid = recipients.filter((r) => !isLikelyEmail(r));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Not a valid email address: ${invalid.join(", ")}` },
      { status: 400 }
    );
  }

  const existing = await getOwnedReport(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // Apply the note the sender typed in the share dialog before rendering, so
  // the email and the link show the same thing.
  const patch: { title?: string; commentary?: string | null } = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title.trim();
  if (parsed.data.commentary !== undefined) {
    patch.commentary = parsed.data.commentary?.trim() || null;
  }
  const report =
    Object.keys(patch).length > 0
      ? (await updateOwnedReport(id, user.id, patch)) ?? existing
      : existing;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    log.error("[reports] RESEND_API_KEY not configured; cannot send report");
    return NextResponse.json(
      { error: "Email delivery is not configured" },
      { status: 503 }
    );
  }

  const from = process.env.RESEND_FROM || "onboarding@resend.dev";
  const senderLabel = report.authorLabel || user.email?.split("@")[0] || "A colleague";
  const reportUrl = buildReportUrl(report.shareToken, getEmailBaseUrl());
  const subject = `${senderLabel} shared a hiring report: ${report.title}`;

  const resend = new Resend(resendKey);
  const emails = recipients.map((to) => ({
    from,
    to,
    subject,
    replyTo: user.email ? [user.email] : undefined,
    react: SearchReportEmail({ report, reportUrl, senderLabel }),
  }));

  const outcome = await retryResendCall(() => resend.batch.send(emails), {
    label: "shared_search_report",
    maxAttempts: 3,
    baseMs: 1000,
  });

  if (!outcome.ok) {
    log.error(
      { err: outcome.error, attempts: outcome.attempts, reportId: id },
      "[reports] Resend batch send failed after retries"
    );
    return NextResponse.json(
      { error: "Could not send the email. The share link still works." },
      { status: 502 }
    );
  }

  await recordReportSend(id, recipients.length);
  log.info(
    { reportId: id, recipientCount: recipients.length },
    "[reports] shared report sent"
  );

  return NextResponse.json({
    sent: recipients.length,
    report,
    url: reportUrl,
  });
}
