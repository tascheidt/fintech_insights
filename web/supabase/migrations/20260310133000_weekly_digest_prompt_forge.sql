INSERT INTO system_settings (setting_key, setting_value, description)
VALUES (
  'weekly_digest_ai',
  '{
    "stage": "weekly-digest",
    "model": "gemini-3-flash-preview",
    "promptTemplate": "",
    "temperature": 0.2,
    "maxOutputTokens": 2048,
    "version": "seeded-placeholder"
  }'::jsonb,
  'Active AI runtime configuration for weekly digest company summaries'
)
ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE prompt_lab_runs
DROP CONSTRAINT IF EXISTS prompt_lab_runs_stage_check;

ALTER TABLE prompt_lab_runs
ADD CONSTRAINT prompt_lab_runs_stage_check
CHECK (stage IN ('job-structure', 'tech-stack', 'weekly-digest'));

ALTER TABLE weekly_digest_companies
ADD COLUMN IF NOT EXISTS current_open_job_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS year_to_date_job_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS weekly_role_themes JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS open_role_themes JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS year_to_date_role_themes JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS continuity TEXT,
ADD COLUMN IF NOT EXISTS continuing_themes JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS new_themes JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN weekly_digest_companies.current_open_job_count IS 'Number of currently active job postings for the company when the digest was generated';
COMMENT ON COLUMN weekly_digest_companies.year_to_date_job_count IS 'Number of jobs first seen since Jan 1 before the digest week';
COMMENT ON COLUMN weekly_digest_companies.weekly_role_themes IS 'Top role themes in the digest week';
COMMENT ON COLUMN weekly_digest_companies.open_role_themes IS 'Top role themes among currently open jobs';
COMMENT ON COLUMN weekly_digest_companies.year_to_date_role_themes IS 'Top role themes in year-to-date history before the digest week';
COMMENT ON COLUMN weekly_digest_companies.continuity IS 'Whether the week continues an existing pattern or shows a new role focus';
COMMENT ON COLUMN weekly_digest_companies.continuing_themes IS 'Role themes that continued from prior year-to-date hiring';
COMMENT ON COLUMN weekly_digest_companies.new_themes IS 'Role themes that appear new in the digest week';
