-- Questrade moved its careers site from Dayforce to Greenhouse (Nov 2026).
--
-- The Dayforce board (jobs.dayforcehcm.com/en-US/qfg/CANDIDATEPORTAL) now
-- renders "no results"; its own /jobposting/search call returned
-- {"maxCount":0} on 2026-11-17 and 2026-11-21. The live board is
-- job-boards.greenhouse.io/questrade (59 jobs on 2026-11-21), served by the
-- public Job Board API at boards-api.greenhouse.io/v1/boards/questrade/jobs.
--
-- `greenhouse` is an API scraper (isBrowserScraper → false), so Questrade now
-- collects inline in the daily `collect` cron instead of via scrape-heavy.yml.

UPDATE companies
SET
  ats_type = 'greenhouse',
  ats_identifier = 'questrade',
  careers_url = 'https://job-boards.greenhouse.io/questrade'
WHERE slug = 'questrade';

-- Verify (expect one row with the new values):
--   SELECT slug, ats_type, ats_identifier, careers_url FROM companies WHERE slug = 'questrade';
