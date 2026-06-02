-- Canonical "active company" read surface.
--
-- Two independent is_active axes exist in this schema and MUST NOT be conflated:
--   * companies.is_active     -- do we track this company at all (soft-delete)
--   * job_postings.is_active   -- is this specific requisition still open
-- The Jobs board's Active/Inactive/All toggle reads the JOB axis; deactivating a
-- company does NOT (and must not) flip its postings' job-level is_active, or we'd
-- destroy which reqs were actually open and corrupt reactivation.
--
-- The leak these views close: a deactivated company (companies.is_active=false)
-- whose postings remain job-level is_active=true was surfacing on user-facing
-- read paths that filtered tier + job is_active but never companies.is_active
-- (Monzo: company inactive, 51 job-active postings -> leaked into Jobs search and
-- cross-company dashboard aggregates).
--
-- Rather than hand-add `.eq("companies.is_active", true)` at every callsite (easy
-- to forget, invisible when missing, and uncovered for service-role/SQL readers),
-- these views BAKE THE FILTER INTO THE RELATION. User-facing reads select from the
-- view; forgetting now means not using the view -- a single greppable/lintable
-- surface -- and the correct path is the shorter one.
--
-- security_invoker = true (PG15+) is mandatory: the view runs with the QUERYING
-- role's privileges, so existing base-table RLS (org scoping) still applies for
-- the cookie-bound client, and the service role bypasses base-table RLS exactly as
-- it does today. The only added constraint is the is_active filter.
--
-- active_job_postings filters by COMPANY activity only and leaves jp.is_active
-- untouched, so the job-level Active/Inactive/All toggle still composes on top
-- (callers keep applying `.eq("is_active", ...)` for the job axis).
--
-- These are READ surfaces. Writes (collect/processor/admin) continue to target the
-- base tables directly.

CREATE OR REPLACE VIEW active_companies
  WITH (security_invoker = true) AS
  SELECT * FROM companies
  WHERE is_active = true;

CREATE OR REPLACE VIEW active_job_postings
  WITH (security_invoker = true) AS
  SELECT jp.*
  FROM job_postings jp
  JOIN companies c ON c.id = jp.company_id
  WHERE c.is_active = true;
