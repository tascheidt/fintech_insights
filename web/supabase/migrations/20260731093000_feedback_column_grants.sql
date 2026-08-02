-- ============================================================================
-- feedback_submissions — column-scoped DML grants (privilege escalation fix)
-- ============================================================================
--
-- THE HOLE
--
-- `authenticated` held table-wide INSERT and UPDATE on every column of
-- feedback_submissions, gated only by the RLS predicate `user_id = auth.uid()`.
-- The anon key ships in the browser bundle, so any signed-in user could skip
-- POST /api/feedback entirely and PostgREST-insert a row directly with:
--
--   { user_id: <self>, status: 'accepted', triage_decision: 'yes',
--     triage_confidence: 10, generated_issue: '<hand-authored markdown>' }
--
-- That row lands in the admin queue already looking AI-vetted. From there it is
-- two clicks to a GitHub issue and then to .github/workflows/auto-implement.yml,
-- which feeds the issue body to a coding agent running with
-- --dangerously-skip-permissions and Bash enabled. In other words: an ordinary
-- user could author the spec that an autonomous agent executes against this
-- repository. The route handler's careful `status: 'submitted'` was decorative
-- because nothing stopped the client from bypassing the route.
--
-- THE FIX
--
-- Postgres column-level privileges. A user may INSERT only the five columns a
-- human actually fills in; everything else (status, all triage_*,
-- generated_issue, admin_*, github_*, reviewed_*) is writable only by the
-- service role. RLS still scopes *which rows*; these grants scope *which
-- columns*, which RLS cannot express.
--
-- Paired code change (same PR): the POST handler no longer sends `status` —
-- the column default supplies 'submitted'. Sending it would now fail.

-- ---------------------------------------------------------------------------
-- anon: no write access at all. Feedback requires a session.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.feedback_submissions FROM anon;

-- ---------------------------------------------------------------------------
-- authenticated: INSERT limited to the user-authored columns
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.feedback_submissions FROM authenticated;

GRANT INSERT (user_id, type, title, description, page_url)
  ON public.feedback_submissions TO authenticated;

-- Admin review actions run on the user-session client (RLS policy
-- "Admins can update feedback" is the row gate). Grant only the columns that
-- flow actually writes — notably NOT the triage_* columns, which are the
-- triage engine's output and must never be user-writable, and not user_id /
-- type / title / description, so an admin cannot silently rewrite what a user
-- said they reported.
GRANT UPDATE (
  status,
  admin_override_decision,
  admin_notes,
  reviewed_by,
  reviewed_at,
  github_issue_number,
  github_issue_url
) ON public.feedback_submissions TO authenticated;

-- ---------------------------------------------------------------------------
-- Trigger function is not an RPC
-- ---------------------------------------------------------------------------
-- Supabase's linter flags this (0028/0029): a SECURITY DEFINER function in the
-- exposed `public` schema is reachable at /rest/v1/rpc/notify_feedback_triage
-- by anon and authenticated. Calling a trigger function that way errors out
-- rather than doing damage, but it has no business being callable at all.
REVOKE EXECUTE ON FUNCTION public.notify_feedback_triage() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_feedback_updated_at() FROM anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Length ceilings (defense in depth behind the Zod schema)
-- ---------------------------------------------------------------------------
-- Zod caps title at 200 / description at 5000 in the route, but a direct
-- PostgREST insert never reaches Zod. page_url had no bound at all in either
-- layer and is rendered in the admin table.

ALTER TABLE public.feedback_submissions
  DROP CONSTRAINT IF EXISTS feedback_title_len,
  DROP CONSTRAINT IF EXISTS feedback_description_len,
  DROP CONSTRAINT IF EXISTS feedback_page_url_len;

ALTER TABLE public.feedback_submissions
  ADD CONSTRAINT feedback_title_len
    CHECK (char_length(title) BETWEEN 3 AND 200) NOT VALID,
  ADD CONSTRAINT feedback_description_len
    CHECK (char_length(description) BETWEEN 10 AND 5000) NOT VALID,
  ADD CONSTRAINT feedback_page_url_len
    CHECK (page_url IS NULL OR char_length(page_url) <= 500) NOT VALID;

-- NOT VALID: enforced on every new/updated row, but existing rows are not
-- re-checked. Validate separately once the backlog is confirmed clean:
--   ALTER TABLE public.feedback_submissions VALIDATE CONSTRAINT feedback_title_len;
