-- Full-text search for the Jobs page search box.
--
-- Before this, /jobs search was a client-side substring match over 500
-- pre-loaded rows (title only). This adds a Postgres full-text vector so
-- getJobsListData() can push the match into the DB across the whole active
-- corpus, including inside the job description body.
--
-- We use a STORED generated `tsvector` rather than trigram ILIKE: trigram
-- ILIKE on long description text forces a bitmap-heap recheck against every
-- candidate's full description (~1.3s for a broad term on the incumbent
-- corpus today, and it degrades as the corpus grows). The tsvector @@ match
-- reads pre-lexemed tokens straight from the GIN index -- no big-text recheck
-- -- and runs in ~10ms for the same query.
--
-- Weights let title matches outrank body matches if we add ts_rank later:
--   A = title, B = location, C = description_text.
--
-- The column is STORED GENERATED, so it is recomputed automatically on write.
-- A row UPDATE recomputes to_tsvector over the (avg ~6KB) description -- cheap,
-- and ingest writes are batched daily, so the write cost is negligible.

ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(location, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description_text, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_job_postings_search_tsv
  ON job_postings USING gin (search_tsv);
