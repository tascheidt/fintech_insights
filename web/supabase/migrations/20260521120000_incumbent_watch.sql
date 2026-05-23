-- Incumbent Watch — weekly-digest block (Phase 2, Surface 3)
--
-- Adds a JSONB column to weekly_digests holding the curated senior big-bank
-- hiring interlude. Shape: { "banks": [ { company_id, company_name,
-- company_slug, signal_role_count, head, interpretation } ] }.
-- NULL means no qualifying incumbent senior hire that week — the digest
-- omits the block (and both surrounding dividers) entirely.

ALTER TABLE weekly_digests
ADD COLUMN IF NOT EXISTS incumbent_watch JSONB;

COMMENT ON COLUMN weekly_digests.incumbent_watch IS
  'Incumbent Watch digest block: { banks: [{ company_id, company_name, company_slug, signal_role_count, head, interpretation }] }. NULL when no qualifying senior big-bank hire that week.';
