-- ============================================================================
-- feedback_submissions — schema baseline (retroactive)
-- ============================================================================
--
-- WHY THIS EXISTS
--
-- `feedback_submissions` was created out-of-band (SQL editor) in Feb 2026 and
-- never had a migration. Two later migrations already reference it:
--   - 20260425100000_function_search_path_lock.sql  (ALTER FUNCTION update_feedback_updated_at)
--   - 20260701000000_tidy_indexes.sql               (DROP/CREATE INDEX ... ON feedback_submissions)
-- so a clean `supabase db reset` fails partway through. This migration is the
-- missing baseline. It is written to be a **no-op against production** (every
-- statement is IF NOT EXISTS / idempotent) while making a from-scratch rebuild
-- succeed.
--
-- The definitions below are transcribed from the live database, NOT from
-- `web/packages/feedback/migration/001_feedback_submissions.sql` — the two had
-- drifted. Differences that matter, and which the live DB wins on:
--   - triage_suggested_labels is JSONB (package said TEXT[])
--   - triage_confidence is INTEGER CHECK 1..10 (package said SMALLINT 0..10)
--   - id defaults to uuid_generate_v4() (package said gen_random_uuid())
--   - admin SELECT/UPDATE RLS policies exist here (package shipped them commented out)
--
-- Ordering note: this file is dated after the two migrations that reference
-- the table, which is harmless for production (nothing to do) but means a
-- from-scratch reset still hits them first. The two statements they need are
-- therefore re-asserted at the bottom of this file rather than relying on
-- ordering.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  type TEXT NOT NULL CHECK (type IN ('feature', 'bug', 'improvement', 'general')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  page_url TEXT,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'reviewing', 'accepted', 'maybe', 'declined')),

  -- AI triage output
  triage_decision TEXT CHECK (triage_decision IN ('yes', 'maybe', 'no')),
  triage_confidence INTEGER CHECK (triage_confidence >= 1 AND triage_confidence <= 10),
  triage_reasoning TEXT,
  triage_mapped_priority TEXT,
  triage_duplicate_of TEXT,
  triage_suggested_title TEXT,
  triage_suggested_labels JSONB DEFAULT '[]'::jsonb,
  triage_completed_at TIMESTAMPTZ,
  generated_issue TEXT,

  -- Admin review
  admin_override_decision TEXT CHECK (admin_override_decision IN ('accepted', 'declined')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,

  -- GitHub linkage
  github_issue_number INTEGER,
  github_issue_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON public.feedback_submissions (user_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
-- `search_path` is pinned empty per 20260425100000_function_search_path_lock.sql;
-- asserted here too so a from-scratch build gets the locked version directly.

CREATE OR REPLACE FUNCTION public.update_feedback_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feedback_updated_at ON public.feedback_submissions;
CREATE TRIGGER feedback_updated_at
  BEFORE UPDATE ON public.feedback_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_feedback_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Both admin routes in @tascheidt/feedback run on the *user-session* client
-- (RLS-bound), not the service-role client — so the admin policies below are
-- load-bearing, not optional. The package's own migration file shipped them
-- commented out, which is why the README's "quick start" produces a silently
-- empty admin panel. Fixed in the package migration in this same PR.

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own feedback" ON public.feedback_submissions;
CREATE POLICY "Users can insert own feedback"
  ON public.feedback_submissions FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own feedback" ON public.feedback_submissions;
CREATE POLICY "Users can view own feedback"
  ON public.feedback_submissions FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all feedback" ON public.feedback_submissions;
CREATE POLICY "Admins can view all feedback"
  ON public.feedback_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update feedback" ON public.feedback_submissions;
CREATE POLICY "Admins can update feedback"
  ON public.feedback_submissions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

COMMENT ON TABLE public.feedback_submissions IS
'In-app user feedback. Written by POST /api/feedback, enriched by the triage engine, actioned by admins. See docs/FEEDBACK_PIPELINE.md.';
