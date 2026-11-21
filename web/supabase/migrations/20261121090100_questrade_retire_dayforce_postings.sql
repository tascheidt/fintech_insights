-- Retire Questrade's Dayforce-era postings after the move to Greenhouse.
--
-- Review before applying: this is a bulk closure, which the Oct 11 2026
-- reconciliation record (docs/QUESTRADE_DAYFORCE_RECONCILIATION_2026-10-11.md)
-- requires to be authorized separately with evidence. Apply it independently
-- of 20261121090000_questrade_greenhouse_ats.sql.
--
-- Why ingest can't do this itself: Greenhouse job IDs are a different ID
-- space from Dayforce's, so no Dayforce-era row will ever reappear in a
-- scrape. Closure detection would propose closing 100% of the active corpus,
-- which trips the mass-closure floor (`exceedsClosureFloor`, >30% of >=20
-- rows) on every run. The rows would then stay active forever beside their
-- Greenhouse replacements, double-counting Questrade.
--
-- Evidence that every Dayforce posting is closed at source: the Dayforce
-- board's own /jobposting/search returned {"maxCount":0,"count":0} on
-- 2026-11-17 and 2026-11-21, and the board renders "We could not find any
-- jobs". Questrade's live postings are on Greenhouse.
--
-- Scope: only rows still active, for Questrade, whose URL is on Dayforce.
-- Greenhouse rows (job-boards.greenhouse.io) are untouched. Same column
-- writes as ingest's own closure path (is_active=false, closed_date=now()).

-- Preview (run first; expect only dayforcehcm.com URLs):
--   SELECT external_id, title, url, last_seen_date
--   FROM job_postings
--   WHERE company_id = (SELECT id FROM companies WHERE slug = 'questrade')
--     AND is_active = true
--     AND url ILIKE '%dayforcehcm.com%'
--   ORDER BY last_seen_date DESC;

UPDATE job_postings
SET
  is_active = false,
  closed_date = now()
WHERE company_id = (SELECT id FROM companies WHERE slug = 'questrade')
  AND is_active = true
  AND url ILIKE '%dayforcehcm.com%';
