-- ============================================================================
-- Unified Job Tracking Migration
-- ============================================================================
-- Migrates all cron jobs to use job_runs table exclusively.
-- Expands job_type CHECK constraint and adds details JSONB column.
-- Then drops the deprecated cron_logs table.
-- ============================================================================

-- ============================================================================
-- Step 1: Expand job_runs.job_type CHECK constraint
-- ============================================================================
-- Current valid types: 'collect', 'analyze'
-- Adding: 'report', 'company-insights', 'insight-generation'

-- Drop existing constraint
ALTER TABLE job_runs 
DROP CONSTRAINT IF EXISTS job_runs_job_type_check;

-- Add expanded constraint with all job types
ALTER TABLE job_runs 
ADD CONSTRAINT job_runs_job_type_check 
CHECK (job_type IN ('collect', 'analyze', 'report', 'company-insights', 'insight-generation'));

-- Add comment explaining job types
COMMENT ON COLUMN job_runs.job_type IS 
'Type of job: collect (job scraping), analyze (AI analysis), report (weekly digest), company-insights (scheduled insight generation), insight-generation (manual insight generation)';

-- ============================================================================
-- Step 2: Add details JSONB column to job_runs (if not exists)
-- ============================================================================
-- Stores job-specific metadata that doesn't fit in standard columns

ALTER TABLE job_runs 
ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';

COMMENT ON COLUMN job_runs.details IS 
'Job-specific metadata as JSONB. Examples: {digestId, totalJobs, emailSent, recipients} for report jobs, {insightId, estimatedCost, researchQualityScore} for insight jobs';

-- ============================================================================
-- Step 3: Add index for details column (GIN for JSONB queries)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_job_runs_details 
ON job_runs USING GIN (details);

-- ============================================================================
-- Step 4: Drop cron_logs table and related objects
-- ============================================================================
-- cron_logs is now deprecated - all jobs use job_runs

-- Drop indexes first
DROP INDEX IF EXISTS idx_cron_logs_job_type;
DROP INDEX IF EXISTS idx_cron_logs_started_at;
DROP INDEX IF EXISTS idx_cron_logs_status;

-- Drop RLS policies
DROP POLICY IF EXISTS "Admins can view cron logs" ON cron_logs;

-- Drop the table
DROP TABLE IF EXISTS cron_logs;

-- ============================================================================
-- Step 5: Update comments for clarity
-- ============================================================================

COMMENT ON TABLE job_runs IS 
'Unified job tracking table for all scheduled and manual jobs. Replaces deprecated cron_logs table. All cron jobs (collect, report, company-insights) and manual operations (analyze, insight-generation) create records here.';
