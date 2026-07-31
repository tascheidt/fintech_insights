/**
 * Database-facing wrapper around the feedback triage engine.
 *
 * Split from `feedback-triage.ts` so the classification policy stays pure and
 * directly testable; everything that touches Supabase lives here.
 *
 * Invoked by POST /api/internal/feedback/triage, which POST /api/feedback calls
 * fire-and-forget after an insert. Previously this ran as an out-of-tree
 * Supabase Edge Function reached through a pg_net trigger — see migration
 * 20260731120000 for why that arrangement was retired.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import {
  triageFeedback,
  MAX_DUPLICATE_CANDIDATES,
  TRIAGE_PROMPT_VERSION,
  type DuplicateCandidate,
  type TriageOptions,
  type TriageResult,
  type TriageSubmission,
} from "./feedback-triage";

/** AI verdict → the legacy `status` column. */
const STATUS_BY_DECISION: Record<string, string> = {
  yes: "accepted",
  maybe: "maybe",
  no: "declined",
};

export interface RunTriageOutcome {
  submissionId: string;
  result: TriageResult;
  status: string;
  candidateCount: number;
}

export async function loadSubmission(id: string): Promise<TriageSubmission | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("feedback_submissions")
    .select("id, type, title, description, page_url")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as TriageSubmission;
}

/**
 * Shortlist prior submissions by trigram similarity. Declined rows are included
 * on purpose — the previous query filtered them out, so a rejected idea was
 * re-triaged with no memory of having been rejected.
 */
export async function loadDuplicateCandidates(
  id: string,
  limit = MAX_DUPLICATE_CANDIDATES
): Promise<DuplicateCandidate[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("feedback_duplicate_candidates", {
    p_id: id,
    p_limit: limit,
  });

  if (error) {
    // Degrade to no-candidates rather than failing triage: a submission with no
    // duplicate context is far better than one that never gets triaged.
    log.warn(
      { submissionId: id, err: error.message },
      "[feedback-triage] duplicate candidate lookup failed; continuing without candidates"
    );
    return [];
  }

  return (data ?? []) as DuplicateCandidate[];
}

/** Run triage for one submission and persist the outcome. */
export async function runTriageForSubmission(
  id: string,
  opts: TriageOptions = {}
): Promise<RunTriageOutcome> {
  const supabase = createAdminClient();

  const submission = await loadSubmission(id);
  if (!submission) throw new Error(`Feedback submission ${id} not found`);

  await supabase
    .from("feedback_submissions")
    .update({ status: "reviewing", triage_attempted_at: new Date().toISOString() })
    .eq("id", id);

  const candidates = await loadDuplicateCandidates(id);

  let result: TriageResult;
  try {
    result = await triageFeedback(submission, candidates, opts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Failure detail goes to triage_error, never triage_reasoning — the latter
    // is rendered to the submitting user, which is how raw Gemini error strings
    // used to reach them. Status stays 'reviewing' so the row is visibly stuck
    // rather than silently resolved.
    await supabase
      .from("feedback_submissions")
      .update({ triage_error: message.slice(0, 2000) })
      .eq("id", id);

    log.error({ submissionId: id, err: message }, "[feedback-triage] triage failed");
    throw err;
  }

  const status = STATUS_BY_DECISION[result.decision] ?? "maybe";

  const { error: updateError } = await supabase
    .from("feedback_submissions")
    .update({
      status,
      triage_decision: result.decision,
      triage_confidence: result.confidence,
      triage_reasoning: result.reasoning,
      triage_mapped_priority: result.mapped_priority,
      triage_duplicate_of: result.duplicate_of,
      triage_suggested_title: result.suggested_title,
      triage_suggested_labels: result.suggested_labels,
      triage_completed_at: new Date().toISOString(),
      triage_error: null,
      generated_issue: result.issue_markdown,
    })
    .eq("id", id);

  if (updateError) {
    throw new Error(`Failed to persist triage for ${id}: ${updateError.message}`);
  }

  log.info(
    {
      submissionId: id,
      type: submission.type,
      decision: result.decision,
      confidence: result.confidence,
      duplicateOf: result.duplicate_of,
      candidateCount: candidates.length,
      policyNotes: result.policy_notes,
      promptVersion: TRIAGE_PROMPT_VERSION,
    },
    "[feedback-triage] completed"
  );

  return { submissionId: id, result, status, candidateCount: candidates.length };
}
