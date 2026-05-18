-- Backfill closures missed by the closed-job detection regression.
--
-- The Phase 2 description-hash gate (20260419150000) changed `existingMap` in
-- processor.ts from Map<external_id, id> to Map<external_id, {id, hash}> but
-- left the closure loop destructuring the value as if it were still the id
-- string. `.eq('id', {object})` matched zero rows, so no job has been marked
-- closed since 2026-04-19. processor.ts is fixed alongside this migration.
--
-- This backfills the missed closures. A job is treated as closed if it is
-- still is_active but was not seen in its company's most recent collect run
-- (last_seen_date predates the day of companies.last_collected_at). closed_date
-- is set to last_seen_date — the last time the job was actually in the feed —
-- so closures land on the timeline when they really happened rather than
-- spiking on the backfill date.
--
-- Companies whose scraper has not run recently (no fresh last_collected_at)
-- are naturally excluded: their jobs share last_seen_date with last_collected_at
-- and so fail the predicate. Idempotent — re-running closes nothing new.

UPDATE job_postings j
SET is_active = false,
    closed_date = j.last_seen_date
FROM companies c
WHERE j.company_id = c.id
  AND j.is_active = true
  AND j.last_seen_date < date_trunc('day', c.last_collected_at);
