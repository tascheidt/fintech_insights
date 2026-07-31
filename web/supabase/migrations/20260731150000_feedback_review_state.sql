-- ============================================================================
-- feedback_submissions.review_state — separate the AI's verdict from the human's
-- ============================================================================
--
-- THE PROBLEM
--
-- `status` was doing two jobs: it held the AI's verdict AND the human workflow
-- state, and the triage engine wrote terminal values straight into it
-- ('accepted' / 'declined'). Once triage ran, there was no way to ask "has a
-- person actually looked at this?" — and FeedbackReviewTable hides its
-- accept/decline controls when status is 'accepted' or 'declined', so an AI
-- verdict was final in the UI. 20 of the 21 pre-existing rows were never
-- human-reviewable.
--
-- Two concrete populations of damage:
--
--   * The two Revolut scraper bug reports (2026-05-25), auto-declined against a
--     phantom duplicate. Unreachable without SQL.
--   * Five rows sitting at status='accepted' with admin_override_decision NULL
--     and github_issue_number NULL — AI-approved, never touched, never shipped,
--     the oldest from 2026-02-17. Filed under the same "Accepted" tab as the 13
--     that actually shipped, so nothing surfaced them.
--
-- THE MODEL
--
-- Two independent axes, in the spirit of the companies.is_active /
-- job_postings.is_active split documented in root CLAUDE.md §7 — same lesson,
-- that conflating two axes corrupts both:
--
--   triage_decision  yes | maybe | no          what the AI concluded
--   review_state     needs_review | approved   what a human decided
--                    | rejected | shipped
--
-- `status` is retained as a legacy mirror of the AI verdict so nothing breaks
-- mid-deploy, but it is no longer the review queue's source of truth.
--
-- THE BACKFILL
--
-- The rule is simply "no recorded human decision means it still needs one",
-- which resurrects exactly the rows that were lost — both Revolut reports and
-- all five orphaned accepts return to the queue without being special-cased.

ALTER TABLE public.feedback_submissions
  ADD COLUMN IF NOT EXISTS review_state TEXT NOT NULL DEFAULT 'needs_review';

ALTER TABLE public.feedback_submissions
  DROP CONSTRAINT IF EXISTS feedback_review_state_check;
ALTER TABLE public.feedback_submissions
  ADD CONSTRAINT feedback_review_state_check
    CHECK (review_state IN ('needs_review', 'approved', 'rejected', 'shipped'));

UPDATE public.feedback_submissions
SET review_state = CASE
  WHEN github_issue_number IS NOT NULL THEN 'shipped'
  WHEN admin_override_decision = 'accepted' THEN 'approved'
  WHEN admin_override_decision = 'declined' THEN 'rejected'
  ELSE 'needs_review'
END;

CREATE INDEX IF NOT EXISTS idx_feedback_review_state
  ON public.feedback_submissions (review_state, created_at DESC);

COMMENT ON COLUMN public.feedback_submissions.review_state IS
'Human review axis: needs_review | approved | rejected | shipped. Independent of triage_decision (the AI verdict) and of the legacy `status` mirror. The admin queue keys off this column — an AI verdict alone must never resolve a submission.';

COMMENT ON COLUMN public.feedback_submissions.status IS
'LEGACY mirror of the AI verdict (submitted/reviewing/accepted/maybe/declined). Retained for compatibility; use triage_decision for the AI verdict and review_state for the human one.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Column-scoped per migration 20260731093000: admins write the review axis, and
-- nothing about a user's own submission or the AI's verdict.
GRANT UPDATE (review_state) ON public.feedback_submissions TO authenticated;

-- ---------------------------------------------------------------------------
-- GitHub issue idempotency
-- ---------------------------------------------------------------------------
-- "Create GitHub Issue" was overloaded onto the accept PATCH, whose only guard
-- was a read-then-write check on github_issue_number — two concurrent clicks
-- both saw NULL and both created an issue. Make the database refuse the second.
CREATE UNIQUE INDEX IF NOT EXISTS uq_feedback_github_issue_number
  ON public.feedback_submissions (github_issue_number)
  WHERE github_issue_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Code-generation idempotency
-- ---------------------------------------------------------------------------
-- Whether code generation had been triggered lived in React state
-- (`codeGenTriggered`), so a page refresh re-enabled the button and a second
-- click dispatched another workflow run and opened another PR.
ALTER TABLE public.feedback_submissions
  ADD COLUMN IF NOT EXISTS code_gen_triggered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS code_gen_triggered_by UUID REFERENCES public.profiles(id);

COMMENT ON COLUMN public.feedback_submissions.code_gen_triggered_at IS
'When the auto-implement workflow was dispatched for this submission. Server-side guard against duplicate dispatches; client state is not durable.';
