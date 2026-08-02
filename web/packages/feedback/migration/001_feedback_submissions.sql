-- @tascheidt/feedback — Feedback Submissions Table
-- Run this migration in your Supabase project to create the feedback_submissions table.
--
-- Prerequisites:
-- 1. A user/profiles table with a UUID primary key linked to auth.users
-- 2. Adjust the REFERENCES clauses below if your user table is not named "profiles"

CREATE TABLE IF NOT EXISTS feedback_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  type TEXT NOT NULL CHECK (type IN ('feature', 'bug', 'improvement', 'general')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 5000),
  page_url TEXT CHECK (page_url IS NULL OR char_length(page_url) <= 500),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'reviewing', 'maybe', 'accepted', 'declined')),

  -- AI triage fields (populated by the triage engine — see README "Feedback flow")
  triage_decision TEXT CHECK (triage_decision IN ('yes', 'maybe', 'no')),
  triage_confidence INTEGER CHECK (triage_confidence BETWEEN 1 AND 10),
  triage_reasoning TEXT,
  triage_mapped_priority TEXT,
  triage_duplicate_of TEXT,
  triage_suggested_title TEXT,
  triage_suggested_labels JSONB DEFAULT '[]'::jsonb,
  triage_completed_at TIMESTAMPTZ,

  -- AI-generated issue content
  generated_issue TEXT,

  -- Admin review fields
  admin_override_decision TEXT CHECK (admin_override_decision IN ('accepted', 'declined')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,

  -- GitHub integration
  github_issue_number INTEGER,
  github_issue_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback_submissions(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_submissions(created_at DESC);

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- NOTE: the admin policies below are REQUIRED, not optional. The admin route
-- handlers (createAdminFeedbackHandlers) run on the user-session client, which
-- is RLS-bound — they do NOT use the service-role client. Ship without these
-- and your admin panel renders an empty list with no error.

ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY;

-- Users can view their own submissions
CREATE POLICY "Users can view own feedback"
  ON feedback_submissions FOR SELECT
  USING (user_id = auth.uid());

-- Users can submit feedback
CREATE POLICY "Users can insert own feedback"
  ON feedback_submissions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all feedback"
  ON feedback_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update feedback"
  ON feedback_submissions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ============================================================================
-- Column-level grants — REQUIRED
-- ============================================================================
-- RLS scopes which *rows* a user can touch; it cannot scope which *columns*.
-- Without these grants, any signed-in user can bypass POST /api/feedback and
-- PostgREST-insert a row with status='accepted' and hand-authored
-- `generated_issue` markdown — i.e. inject content straight into the admin
-- queue and, if you have the GitHub/code-gen integrations enabled, into an
-- automated coding pipeline. Do not skip this section.

REVOKE INSERT, UPDATE, DELETE ON feedback_submissions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON feedback_submissions FROM authenticated;

-- Users may write only the columns a human fills in. `status` is intentionally
-- excluded — the column default supplies it, and the POST handler does not
-- send it.
GRANT INSERT (user_id, type, title, description, page_url)
  ON feedback_submissions TO authenticated;

-- Admin review actions (PATCH) write only these.
GRANT UPDATE (
  status, admin_override_decision, admin_notes,
  reviewed_by, reviewed_at, github_issue_number, github_issue_url
) ON feedback_submissions TO authenticated;

-- ============================================================================
-- Auto-update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_feedback_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_feedback_updated_at() FROM anon, authenticated, public;

CREATE TRIGGER feedback_updated_at
  BEFORE UPDATE ON feedback_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_feedback_updated_at();
