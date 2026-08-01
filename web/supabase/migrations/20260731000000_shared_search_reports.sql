-- Shared search reports.
--
-- A user runs a search on /jobs, clicks "Generate report", and gets a
-- point-in-time artifact they can email to someone: an AI synthesis of the
-- role types in the result set, plus a table of the matching jobs.
--
-- Two deliberate design choices, both load-bearing:
--
-- 1. `jobs_snapshot` denormalizes the result rows at generation time. A shared
--    report is a *sent artifact* — the recipient must see what the sender saw,
--    not a live query that drifts as roles close or companies are deactivated.
--    Snapshotting also means the public renderer never touches `job_postings`
--    or `companies`, so there is no read path for an anonymous viewer to walk
--    into. Cap enforced in the API route (MAX_REPORT_JOBS), so the JSONB stays
--    tens of KB — not another `job_run_tasks.scraped_data` (June 2026).
--
-- 2. **No anon RLS policy.** The public report page at `/r/[token]` reads
--    through the service-role admin client with an explicit `share_token`
--    lookup, so the token IS the capability. Granting `anon` SELECT on this
--    table would let anyone enumerate every report; the policies below stay
--    owner-scoped and the public surface is a single server-side lookup.
--
-- Retention: `expires_at` defaults to 90 days out and the daily collect cron
-- prunes expired rows (see web/lib/jobs/retention.ts).

CREATE TABLE IF NOT EXISTS shared_search_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- URL-safe capability token (base64url, 24 chars). The public route
  -- `/r/[token]` resolves a report by this and nothing else.
  share_token TEXT NOT NULL UNIQUE,

  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Display name / email shown as the report byline. Denormalized so the
  -- public renderer needs no join into auth-owned tables.
  author_label TEXT,

  title TEXT NOT NULL,
  -- The sender's note to the recipient. Editable after generation.
  commentary TEXT,

  -- The search that produced the set: { query, mode, company, functionGroup,
  -- recency, tier, status }. Rendered as a provenance line on the report.
  search_context JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Gemini synthesis: { headline, summary, roleGroups[], commonRequirements[] }.
  -- Nullable — a synthesis failure still produces a usable table-only report.
  synthesis JSONB,

  -- Denormalized result rows (see note 1 above).
  jobs_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Rows actually captured in the snapshot.
  job_count INTEGER NOT NULL DEFAULT 0,
  -- Rows the search matched before the snapshot cap; > job_count means the
  -- report renders a "showing N of M" note.
  total_match_count INTEGER NOT NULL DEFAULT 0,

  -- Provenance for the synthesis block.
  model TEXT,
  prompt_version TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  -- Set by the owner to kill a link early. Checked by the public renderer.
  revoked_at TIMESTAMPTZ,

  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  email_sent_count INTEGER NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shared_search_reports_created_by
  ON shared_search_reports(created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_search_reports_expires_at
  ON shared_search_reports(expires_at);

ALTER TABLE shared_search_reports ENABLE ROW LEVEL SECURITY;

-- Owner-scoped policies only. Anonymous reads are served by the service role
-- (which bypasses RLS) behind an exact share_token match — see the header note.
CREATE POLICY "Users can read their own shared reports"
  ON shared_search_reports FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can create their own shared reports"
  ON shared_search_reports FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own shared reports"
  ON shared_search_reports FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete their own shared reports"
  ON shared_search_reports FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- Atomic view counter for the public page. SECURITY DEFINER so the increment
-- works without granting anyone UPDATE on the table; the search_path lock
-- matches migration 20260425100000.
CREATE OR REPLACE FUNCTION increment_shared_report_view(p_report_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE shared_search_reports
  SET view_count = view_count + 1,
      last_viewed_at = NOW()
  WHERE id = p_report_id;
$$;

REVOKE ALL ON FUNCTION increment_shared_report_view(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_shared_report_view(UUID) FROM anon;

COMMENT ON TABLE shared_search_reports IS
  'Point-in-time shareable reports generated from a /jobs search. Read publicly by share_token via the service role; see web/lib/reports/ and docs/SHARED_REPORTS.md.';
