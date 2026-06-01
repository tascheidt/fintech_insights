-- Scope semantic job search to ACTIVE companies only. The original
-- match_job_ids_semantic (20260529120000) filtered by company tier but not by
-- companies.is_active, so jobs from a deactivated company (e.g. Monzo, whose
-- job_postings rows are still job-level is_active=true) leaked into results.
-- The Jobs board contract is "the companies we cover" = active companies, so an
-- inactive company must never surface regardless of its jobs' own status.
--
-- Filtering here (not just in the hydrate query) also keeps the match_count
-- candidate budget from being spent on rows we will immediately drop.
--
-- search_path is locked to '' (repo convention), so vector type/operator stay
-- public-qualified. Body is otherwise unchanged from 20260529120000.
CREATE OR REPLACE FUNCTION match_job_ids_semantic(
  query_embedding vector(768),
  tier_filter text[],
  match_count int DEFAULT 1000
)
RETURNS TABLE (id uuid, distance double precision)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  PERFORM set_config('hnsw.ef_search', '250', true);
  RETURN QUERY
    SELECT jp.id, (jp.embedding OPERATOR(public.<=>) query_embedding) AS distance
    FROM public.job_postings jp
    JOIN public.companies c ON c.id = jp.company_id
    WHERE jp.embedding IS NOT NULL
      AND c.tier = ANY(tier_filter)
      AND c.is_active = true
    ORDER BY jp.embedding OPERATOR(public.<=>) query_embedding
    LIMIT match_count;
END;
$$;
