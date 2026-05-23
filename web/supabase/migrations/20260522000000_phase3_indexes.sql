-- Phase 3 indexes — pre-empt the query-plan degradation Luke flagged
-- ahead of the Big-6 bank ramp (~7,500 active job_postings rows + the new
-- "Incumbent Bets" dashboard rail that calls getIncumbentBets() on every
-- page load).
--
-- 1. Composite, partial index on the per-company windowed query shape.
--    Covers getIncumbentBets (both the signal-window query and the
--    company-detail panel scope) plus the per-company sparkline / hiring-
--    delta / pivot-classification queries that all share the same access
--    pattern: WHERE company_id = ? AND is_active = TRUE AND first_seen_date
--    >= ?. DESC matches the read order — newest first.
--
-- 2. Partial, single-column index on companies.tier among active rows.
--    Every tier-aware aggregator (dashboard KPIs, competitive matrix, hot
--    roles, weekly digest, themes) joins companies!inner with
--    .eq("companies.is_active", true) and .in/eq("companies.tier", ...).
--    A partial index keyed on tier among the active-only set lets the
--    planner skip the redundant filter step.

CREATE INDEX IF NOT EXISTS idx_job_postings_company_active_first_seen
  ON job_postings (company_id, first_seen_date DESC)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_companies_tier_active
  ON companies (tier)
  WHERE is_active = TRUE;

COMMENT ON INDEX idx_job_postings_company_active_first_seen IS
  'Per-company windowed query path: getIncumbentBets, getCompanyHiringSparkline, getCompanyHiringDelta, classifyCompanyPivot.';
COMMENT ON INDEX idx_companies_tier_active IS
  'Phase 0 tier filter on active companies — joined by every cross-company aggregator.';
