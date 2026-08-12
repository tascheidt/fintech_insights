/**
 * POST /api/admin/feedback/[id]/retriage — re-run AI triage for one submission.
 *
 * Triage could fail and leave a submission permanently stuck. The engine writes
 * the failure to `triage_error` and holds `status` at 'reviewing' so the row is
 * visibly broken rather than silently resolved — but the admin panel rendered
 * that failure with no way to act on it. The only retry paths were
 * `/api/internal/feedback/triage` (CRON_SECRET, not reachable from a browser
 * session) and `web/scripts/triage-feedback.ts` (shell + .env.local). So a
 * failed triage needed a developer, which is how two report-generation bug
 * reports sat untriaged from 2026-07-31 while the retired edge function's
 * `gemini-3-pro-preview` 404 stared out of the UI.
 *
 * This lives in the app rather than in `@tascheidt/feedback` on purpose: the
 * package is host-agnostic and reaches triage through the `onSubmissionCreated`
 * hook, whereas `runTriageForSubmission` is this app's engine.
 *
 * Cost: one grounded-free Pro call per request (TRIAGE_MODEL). Admin-only, and
 * a row already being triaged is rejected rather than double-spent.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTriageForSubmission } from "@/lib/analysis/feedback-triage-runner";
import { log } from "@/lib/log";

export const maxDuration = 120;

/**
 * A triage run that is still in flight has `triage_attempted_at` set and no
 * `triage_completed_at`. Anything older than this is treated as abandoned — the
 * route's own ceiling is 120s, so a genuinely concurrent run cannot be older.
 */
const IN_FLIGHT_WINDOW_MS = 5 * 60 * 1000;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const supabase = createAdminClient();
  const { data: existing, error: loadError } = await supabase
    .from("feedback_submissions")
    .select("id, triage_attempted_at, triage_completed_at")
    .eq("id", id)
    .maybeSingle();

  if (loadError || !existing) {
    return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
  }

  const attemptedAt = existing.triage_attempted_at
    ? new Date(existing.triage_attempted_at).getTime()
    : null;
  const inFlight =
    attemptedAt !== null &&
    !existing.triage_completed_at &&
    Date.now() - attemptedAt < IN_FLIGHT_WINDOW_MS;

  if (inFlight) {
    return NextResponse.json(
      { error: "Triage is already running for this submission." },
      { status: 409 }
    );
  }

  try {
    const outcome = await runTriageForSubmission(id);
    log.info(
      { submissionId: id, adminId: auth.user.id, decision: outcome.result.decision },
      "[api] admin re-ran feedback triage"
    );
    return NextResponse.json({
      ok: true,
      id: outcome.submissionId,
      decision: outcome.result.decision,
      confidence: outcome.result.confidence,
      status: outcome.status,
    });
  } catch (err) {
    // runTriageForSubmission has already persisted the detail to triage_error;
    // return it so the admin sees why without a round-trip to the logs.
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, id }, "[api] admin re-triage failed");
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
