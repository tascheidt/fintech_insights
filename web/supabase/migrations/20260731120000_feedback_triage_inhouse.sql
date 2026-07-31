-- ============================================================================
-- Feedback triage moves into the app
-- ============================================================================
--
-- WHAT WAS THERE
--
-- An AFTER INSERT trigger (`feedback_triage_webhook`) called `net.http_post`
-- against a Supabase Edge Function, `triage-feedback`, whose source lived
-- nowhere in this repository. That arrangement failed on every axis we care
-- about:
--
--   * Unversioned. Not in git, not in CI, not visible to gemini-compare.ts or
--     the doc-drift check. Last deployed Feb 2026; nobody could review it.
--   * Pinned to `gemini-3-pro-preview` — a versioned PREVIEW model id, the #1
--     anti-pattern in CLAUDE.md §8, which prompt-config.test.ts names by
--     example and could not catch because the call-site was out of tree.
--   * Wrote no `gemini_usage_events` row, so a Pro call with a 64k output
--     budget was structurally invisible to the daily cost alarm.
--   * `verify_jwt: false` — publicly invocable by anyone on the internet. A
--     POST with any {record:{id,title,description}} spent a Pro call; with a
--     known row id it overwrote that row's triage fields via the service-role
--     client.
--   * Fire-and-forget with no observability: net._http_response was empty, so
--     there was no way to tell whether a webhook had ever fired.
--
-- WHAT REPLACES IT
--
-- POST /api/feedback now invokes /api/internal/feedback/triage directly, with
-- the CRON_SECRET bearer header the repo already uses for internal fan-out
-- (see web/lib/auth/CLAUDE.md). No pg_net, no trigger, no secret stored in the
-- database, no public endpoint, and the work runs where AI_MODEL_OPTIONS,
-- recordUsage/writeUsageEvent and the log pipeline already live.
--
-- Follow-up (manual, after this deploys): delete the `triage-feedback` Edge
-- Function in the Supabase dashboard. It is inert once the trigger is gone, but
-- it stays publicly invocable until deleted.

DROP TRIGGER IF EXISTS feedback_triage_webhook ON public.feedback_submissions;
DROP FUNCTION IF EXISTS public.notify_feedback_triage();

-- ---------------------------------------------------------------------------
-- triage_error — keep failure detail off user-facing fields
-- ---------------------------------------------------------------------------
-- The edge function wrote `Triage error: <raw Gemini message>` into
-- triage_reasoning, which FeedbackHistory renders directly to the submitter.
-- Failures now land here instead; triage_reasoning stays admin-facing prose.

ALTER TABLE public.feedback_submissions
  ADD COLUMN IF NOT EXISTS triage_error TEXT,
  ADD COLUMN IF NOT EXISTS triage_attempted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.feedback_submissions.triage_error IS
'Last triage failure message. Internal only — never render to the submitting user.';
COMMENT ON COLUMN public.feedback_submissions.triage_attempted_at IS
'When triage last ran, success or failure. A row with attempted_at set and triage_completed_at null needs a retry.';

-- ---------------------------------------------------------------------------
-- triage_duplicate_of becomes a real reference
-- ---------------------------------------------------------------------------
-- It was TEXT holding whatever the model returned. In production that is the
-- literal string '#2' on every populated row — a positional index into a
-- prompt-time list, referencing nothing. Those values are discarded (they carry
-- no recoverable meaning) and the column becomes a UUID self-reference.

UPDATE public.feedback_submissions
SET triage_duplicate_of = NULL
WHERE triage_duplicate_of IS NOT NULL
  AND triage_duplicate_of !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

ALTER TABLE public.feedback_submissions
  ALTER COLUMN triage_duplicate_of TYPE UUID USING triage_duplicate_of::uuid;

ALTER TABLE public.feedback_submissions
  DROP CONSTRAINT IF EXISTS feedback_duplicate_of_fkey;

ALTER TABLE public.feedback_submissions
  ADD CONSTRAINT feedback_duplicate_of_fkey
    FOREIGN KEY (triage_duplicate_of)
    REFERENCES public.feedback_submissions(id)
    ON DELETE SET NULL;

-- A row cannot duplicate itself.
ALTER TABLE public.feedback_submissions
  DROP CONSTRAINT IF EXISTS feedback_duplicate_not_self;
ALTER TABLE public.feedback_submissions
  ADD CONSTRAINT feedback_duplicate_not_self
    CHECK (triage_duplicate_of IS NULL OR triage_duplicate_of <> id);

-- ---------------------------------------------------------------------------
-- Duplicate candidate lookup
-- ---------------------------------------------------------------------------
-- Shortlists prior submissions by trigram similarity on title + description so
-- the model is asked to adjudicate a small, plausible set rather than scan an
-- arbitrary 50-row window. Declined rows are deliberately INCLUDED: the old
-- query filtered to triage_decision IN ('yes','maybe'), so a rejected idea was
-- re-triaged from scratch every time and could silently flip.
--
-- pg_trgm is already installed (see get_advisors / initial jobs search work).

CREATE INDEX IF NOT EXISTS idx_feedback_title_trgm
  ON public.feedback_submissions USING gin (title public.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.feedback_duplicate_candidates(
  p_id UUID,
  p_limit INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  triage_decision TEXT,
  status TEXT,
  github_issue_number INT,
  similarity REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    f.id,
    f.title,
    f.triage_decision,
    f.status,
    f.github_issue_number,
    GREATEST(
      public.similarity(f.title, src.title),
      public.similarity(f.title, src.description) * 0.5
    ) AS similarity
  FROM public.feedback_submissions f
  CROSS JOIN (
    SELECT title, description
    FROM public.feedback_submissions
    WHERE id = p_id
  ) src
  WHERE f.id <> p_id
  ORDER BY similarity DESC, f.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;

-- Service-role only: this reads every user's feedback titles.
REVOKE EXECUTE ON FUNCTION public.feedback_duplicate_candidates(UUID, INT)
  FROM anon, authenticated, public;
