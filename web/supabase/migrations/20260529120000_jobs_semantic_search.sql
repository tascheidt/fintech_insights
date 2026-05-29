-- Semantic (vector) search for the Jobs page. Companion to the full-text
-- search_tsv column (20260528120000): full-text handles exact/keyword/phrase
-- matching; this handles "find roles like this" by embedding meaning.
--
-- Embeddings are produced by Gemini gemini-embedding-001 at 768 dimensions
-- (Matryoshka-truncated). The provenance columns (embedding_model,
-- embedding_dims) are mandatory: a vector column with no record of which model
-- produced it is a silent data-integrity bug -- the day the model or
-- dimensionality changes, old rows become incomparable to new query embeddings
-- and ranking quietly returns garbage. The query path / backfill refuse to mix
-- model+dims, and the backfill re-embeds on a model change.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS embedding_model text,
  ADD COLUMN IF NOT EXISTS embedding_dims int,
  ADD COLUMN IF NOT EXISTS embedding_generated_at timestamptz;

-- HNSW (cosine): no training set required (unlike IVFFlat), scales smoothly,
-- and is maintained incrementally as the backfill sweep populates rows.
CREATE INDEX IF NOT EXISTS idx_job_postings_embedding_hnsw
  ON job_postings USING hnsw (embedding vector_cosine_ops);

-- Returns job ids ranked by cosine distance to the query embedding, scoped to
-- the given company tiers. search_path is locked to '' (repo security
-- convention, see 20260425100000_function_search_path_lock.sql), so the vector
-- type and operator are public-qualified.
CREATE OR REPLACE FUNCTION match_job_ids_semantic(
  query_embedding vector(768),
  tier_filter text[],
  match_count int DEFAULT 1000
)
RETURNS TABLE (id uuid, distance double precision)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jp.id, (jp.embedding OPERATOR(public.<=>) query_embedding) AS distance
  FROM public.job_postings jp
  JOIN public.companies c ON c.id = jp.company_id
  WHERE jp.embedding IS NOT NULL
    AND c.tier = ANY(tier_filter)
  ORDER BY jp.embedding OPERATOR(public.<=>) query_embedding
  LIMIT match_count;
$$;
