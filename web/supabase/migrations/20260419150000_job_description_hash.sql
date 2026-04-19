-- Phase 2 of the Gemini cost-reduction plan: gate `extractAndUpdateStructure`
-- on description_text change to stop re-extracting unchanged job descriptions
-- on every scrape. Adds a SHA-1 hash column and backfills every existing row
-- in the same migration so the first scrape after deploy already sees
-- populated hashes and skips unchanged jobs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS description_hash TEXT;

COMMENT ON COLUMN job_postings.description_hash IS
  'SHA-1 hex digest of description_text. Used by processor.ts to skip extractAndUpdateStructure when the description has not changed since the last scrape. Nullable; null is treated as "description changed" on the next scrape so the first run post-deploy still populates every hash.';

UPDATE job_postings
SET description_hash = encode(digest(description_text, 'sha1'), 'hex')
WHERE description_hash IS NULL
  AND description_text IS NOT NULL;
