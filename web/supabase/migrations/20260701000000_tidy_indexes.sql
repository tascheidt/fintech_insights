-- Schema tidy-up: drop dead indexes, cover unindexed foreign keys.
--
-- Context: while pulling the DB back under the free-tier quota (July 2026) the
-- Supabase advisor flagged 40 unused indexes and 11 unindexed foreign keys.
-- Stats have never been reset, so a 0-scan count reflects ~5.5 months of real
-- production traffic — a trustworthy "never used" signal.
--
-- Policy applied here (the standard rule):
--   * Drop every index that serves neither a SELECT (idx_scan = 0), a unique
--     constraint, a primary key, nor a foreign key.
--   * KEEP every FK-covering index even if it shows 0 scans — dropping it would
--     just recreate an "unindexed foreign key" warning and slow cascade deletes.
--   * ADD a covering index for each FK that lacks one.
--
-- Not touched: the two search indexes (idx_job_postings_embedding_hnsw,
-- idx_job_postings_search_tsv) back live semantic + full-text search and are
-- kept by design, and all *_pkey / *_key unique constraints.

-- 1. Drop genuinely-orphan secondary indexes (0 scans, not unique/PK/FK-cover).
DROP INDEX IF EXISTS public.idx_job_postings_keywords;
DROP INDEX IF EXISTS public.idx_job_postings_tech_stack;
DROP INDEX IF EXISTS public.idx_job_postings_location_city;
DROP INDEX IF EXISTS public.idx_job_postings_location_state;
DROP INDEX IF EXISTS public.idx_job_postings_location_country;
DROP INDEX IF EXISTS public.idx_job_postings_function_category;
DROP INDEX IF EXISTS public.idx_job_postings_seniority;
DROP INDEX IF EXISTS public.idx_job_postings_standardized_dept;
DROP INDEX IF EXISTS public.idx_gemini_usage_events_call_site;
DROP INDEX IF EXISTS public.idx_job_runs_details;
DROP INDEX IF EXISTS public.idx_job_runs_trigger_type;
DROP INDEX IF EXISTS public.idx_job_run_tasks_current_stage;
DROP INDEX IF EXISTS public.idx_strategic_insights_run_date;
DROP INDEX IF EXISTS public.idx_strategic_insights_novelty;
DROP INDEX IF EXISTS public.idx_strategic_insights_executive;
DROP INDEX IF EXISTS public.idx_company_insights_generated;
DROP INDEX IF EXISTS public.idx_company_insights_period;
DROP INDEX IF EXISTS public.idx_company_insights_significance;
DROP INDEX IF EXISTS public.idx_weekly_digests_generated;
DROP INDEX IF EXISTS public.idx_feedback_created;
DROP INDEX IF EXISTS public.idx_feedback_status;
DROP INDEX IF EXISTS public.cross_company_themes_generated_at_idx;
DROP INDEX IF EXISTS public.idx_prompt_lab_runs_created_at;
DROP INDEX IF EXISTS public.idx_prompt_lab_runs_stage;
DROP INDEX IF EXISTS public.idx_weekly_digest_deliveries_status;
DROP INDEX IF EXISTS public.idx_weekly_digest_deliveries_sent_at;
DROP INDEX IF EXISTS public.idx_audit_log_created;
DROP INDEX IF EXISTS public.idx_job_templates_category;

-- 2. Cover the 11 foreign keys that lacked a leading-column index.
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_companies_created_by ON public.companies (created_by);
CREATE INDEX IF NOT EXISTS idx_company_insights_previous_insight_id ON public.company_insights (previous_insight_id);
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_reviewed_by ON public.feedback_submissions (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_job_runs_company_id ON public.job_runs (company_id);
CREATE INDEX IF NOT EXISTS idx_job_runs_triggered_by ON public.job_runs (triggered_by);
CREATE INDEX IF NOT EXISTS idx_job_templates_job_posting_id ON public.job_templates (job_posting_id);
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles (organization_id);
CREATE INDEX IF NOT EXISTS idx_prompt_lab_runs_created_by ON public.prompt_lab_runs (created_by);
CREATE INDEX IF NOT EXISTS idx_prompt_lab_runs_company_id ON public.prompt_lab_runs (company_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_updated_by ON public.system_settings (updated_by);
