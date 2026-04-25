-- Lock search_path for functions flagged by the Supabase database linter
-- (lint 0011_function_search_path_mutable, level WARN).
--
-- Why: a function with a mutable search_path can resolve unqualified
-- identifiers against an attacker-controlled schema if one is ever planted
-- ahead of `public` on the search_path. The first two below are SECURITY
-- INVOKER trigger callbacks (low practical risk) but
-- `update_job_run_stats(uuid)` is SECURITY DEFINER, so pinning its
-- search_path is the meaningful win — DEFINER functions run as the
-- function owner, and a hijacked search_path could escalate access.
--
-- Forward-only DDL; reversible with ALTER FUNCTION ... RESET search_path.

ALTER FUNCTION public.update_insight_conversations_updated_at()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.update_job_run_stats(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.update_feedback_updated_at()
  SET search_path = public, pg_temp;
