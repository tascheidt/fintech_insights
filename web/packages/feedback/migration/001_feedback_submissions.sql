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
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  page_url TEXT,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'reviewing', 'maybe', 'accepted', 'declined')),

  -- AI triage fields (populated by external Edge Function or webhook)
  triage_decision TEXT CHECK (triage_decision IN ('yes', 'maybe', 'no')),
  triage_confidence SMALLINT CHECK (triage_confidence BETWEEN 0 AND 10),
  triage_reasoning TEXT,
  triage_mapped_priority TEXT,
  triage_duplicate_of TEXT,
  triage_suggested_title TEXT,
  triage_suggested_labels TEXT[],
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

-- Row Level Security
ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY;

-- Users can view their own submissions
CREATE POLICY "Users can view own feedback"
  ON feedback_submissions FOR SELECT
  USING (user_id = auth.uid());

-- Users can submit feedback
CREATE POLICY "Users can submit feedback"
  ON feedback_submissions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Admin access: use service-role key (bypasses RLS) for admin routes.
-- If you prefer RLS-based admin access, add a policy like:
--
-- CREATE POLICY "Admins can view all feedback"
--   ON feedback_submissions FOR SELECT
--   USING (
--     EXISTS (
--       SELECT 1 FROM profiles
--       WHERE profiles.id = auth.uid()
--       AND profiles.role = 'admin'
--     )
--   );
--
-- CREATE POLICY "Admins can update feedback"
--   ON feedback_submissions FOR UPDATE
--   USING (
--     EXISTS (
--       SELECT 1 FROM profiles
--       WHERE profiles.id = auth.uid()
--       AND profiles.role = 'admin'
--     )
--   );

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER feedback_updated_at
  BEFORE UPDATE ON feedback_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_feedback_updated_at();
