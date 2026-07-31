/**
 * Internal feedback triage endpoint.
 *
 * Replaces the `triage-feedback` Supabase Edge Function, which ran with
 * `verify_jwt: false` — publicly invocable by anyone on the internet, spending a
 * Gemini Pro call per request and, with a known row id, overwriting that row's
 * triage fields through the service-role client.
 *
 * Guarded by CRON_SECRET, matching the internal fan-out convention in
 * web/lib/auth/CLAUDE.md (`/api/internal/**` -> requireCronSecret). Called
 * fire-and-forget by POST /api/feedback after an insert, and by the re-triage
 * script.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCronSecret } from "@/lib/auth/guards";
import { runTriageForSubmission } from "@/lib/analysis/feedback-triage-runner";
import { log } from "@/lib/log";

export const maxDuration = 120;

const bodySchema = z.object({ id: z.string().uuid() });

export async function POST(req: NextRequest) {
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const outcome = await runTriageForSubmission(parsed.data.id);
    return NextResponse.json({
      ok: true,
      id: outcome.submissionId,
      decision: outcome.result.decision,
      confidence: outcome.result.confidence,
      status: outcome.status,
      duplicate_of: outcome.result.duplicate_of,
      candidate_count: outcome.candidateCount,
      policy_notes: outcome.result.policy_notes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, id: parsed.data.id }, "[api] feedback triage failed");
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
