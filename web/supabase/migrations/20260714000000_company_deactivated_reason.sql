-- ============================================================================
-- companies.deactivated_reason — context for why a company was turned off
-- ============================================================================
--
-- `is_active = false` alone can't distinguish "company shut down, stop
-- probing forever" from "scraper broken, parked until someone investigates".
-- The Koho incident (July 2026) showed how the second kind silently becomes
-- the first: a company disabled during an ATS migration fell out of every
-- health check and stayed dark for months.
--
-- The weekly scraper-drift check (web/scripts/scraper-drift-check.ts) probes
-- inactive fintech companies for a live board and includes this reason in its
-- admin alert so a human can tell at a glance whether the dormancy is
-- intentional. Set it whenever deactivating a company.

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS deactivated_reason TEXT;

COMMENT ON COLUMN companies.deactivated_reason IS
'Why is_active was set false (e.g. "shut down 2026-05", "ATS moved — investigating"). Surfaced by the weekly scraper-drift check so parked-but-alive companies are not forgotten. Null on active companies.';
