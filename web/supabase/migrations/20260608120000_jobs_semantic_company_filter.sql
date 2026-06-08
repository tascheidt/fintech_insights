-- Add an optional company scope to semantic job search.
--
-- Problem: match_job_ids_semantic ranks the WHOLE tier and returns only the
-- top `match_count` nearest vectors. When the user then narrows to one company
-- (e.g. CIBC), that filtering happened client-side over the already-capped
-- window — so a company whose roles didn't crack the global top-N simply
-- showed nothing, even though it has plenty of relevant postings. (For "AI" in
-- the incumbent tier, RBC alone took 121/200 slots; CIBC's nearest two were
-- both closed, so CIBC fell out entirely.)
--
-- Fix: push the company scope into the RPC so the nearest-neighbour search runs
-- WITHIN the selected company, and the match_count budget is spent on rows we
-- will actually keep. company_filter is a slug array (companies.slug) and
-- defaults NULL = no scope (unchanged tier-wide behaviour).
--
-- Backward compatible: callers that omit company_filter (the prior 3-arg shape)
-- resolve to this function via the default, so an in-flight deploy where old
-- code still calls the 3-arg form keeps working. We DROP first because a
-- CREATE OR REPLACE cannot add a parameter to an existing signature.
--
-- search_path is locked to '' (repo convention), so vector type/operator stay
-- public-qualified. Body is otherwise unchanged from 20260601120000 apart from
-- the new predicate.

DROP FUNCTION IF EXISTS match_job_ids_semantic(vector(768), text[], int);

CREATE OR REPLACE FUNCTION match_job_ids_semantic(
  query_embedding vector(768),
  tier_filter text[],
  match_count int DEFAULT 1000,
  company_filter text[] DEFAULT NULL
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
      AND (company_filter IS NULL OR c.slug = ANY(company_filter))
    ORDER BY jp.embedding OPERATOR(public.<=>) query_embedding
    LIMIT match_count;
END;
$$;
