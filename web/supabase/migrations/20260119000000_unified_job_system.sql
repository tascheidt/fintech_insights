-- Unified Job Processing System Migration
-- Creates job_runs and job_run_tasks tables for tracking all job processing
-- Replaces cron_logs table (which will be dropped after migration)

-- Job runs table (parent record for any collection or analysis run)
CREATE TABLE job_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Job type (two-phase: collect then analyze)
  job_type TEXT NOT NULL CHECK (job_type IN ('collect', 'analyze')) DEFAULT 'collect',
  parent_job_run_id UUID REFERENCES job_runs(id), -- Links analyze job to its collection job
  
  -- Trigger context
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('cron', 'manual', 'admin')),
  triggered_by UUID REFERENCES profiles(id), -- NULL for cron
  
  -- Scope
  scope TEXT NOT NULL CHECK (scope IN ('all', 'single')),
  company_id UUID REFERENCES companies(id), -- Only set when scope='single'
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Aggregate stats (computed from tasks)
  total_companies INTEGER DEFAULT 0,
  completed_companies INTEGER DEFAULT 0,
  failed_companies INTEGER DEFAULT 0,
  total_new_jobs INTEGER DEFAULT 0,
  total_updated_jobs INTEGER DEFAULT 0,
  total_closed_jobs INTEGER DEFAULT 0,
  total_insights INTEGER DEFAULT 0,
  
  error_message TEXT
);

-- Job run tasks table (per-company tracking within a job run)
CREATE TABLE job_run_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_run_id UUID NOT NULL REFERENCES job_runs(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Overall task status
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Stage tracking
  current_stage TEXT CHECK (current_stage IN ('scrape', 'ingest', 'analyze', 'done')),
  stage_progress JSONB DEFAULT '{}',
  
  -- Results (collection)
  jobs_fetched INTEGER DEFAULT 0,
  new_jobs INTEGER DEFAULT 0,
  updated_jobs INTEGER DEFAULT 0,
  closed_jobs INTEGER DEFAULT 0,
  
  -- Results (analysis)
  insights_generated INTEGER DEFAULT 0,
  
  -- For resumability
  scraped_data JSONB, -- Raw ATS data (allows re-running ingest without re-scraping)
  pending_analysis_job_ids UUID[] DEFAULT '{}', -- Job posting IDs that need analysis
  
  error_message TEXT,
  error_stage TEXT,
  
  UNIQUE(job_run_id, company_id)
);

-- Indexes for performance
CREATE INDEX idx_job_runs_status ON job_runs(status);
CREATE INDEX idx_job_runs_started_at ON job_runs(started_at DESC);
CREATE INDEX idx_job_runs_job_type ON job_runs(job_type);
CREATE INDEX idx_job_runs_parent_job_run ON job_runs(parent_job_run_id);
CREATE INDEX idx_job_runs_trigger_type ON job_runs(trigger_type);
CREATE INDEX idx_job_run_tasks_job_run ON job_run_tasks(job_run_id);
CREATE INDEX idx_job_run_tasks_company ON job_run_tasks(company_id);
CREATE INDEX idx_job_run_tasks_status ON job_run_tasks(status);
CREATE INDEX idx_job_run_tasks_current_stage ON job_run_tasks(current_stage);

-- RLS policies
ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_run_tasks ENABLE ROW LEVEL SECURITY;

-- Users can view job runs for their organization's companies
CREATE POLICY "Users can view job runs for their org"
  ON job_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN companies c ON c.organization_id = p.organization_id
      WHERE p.id = auth.uid()
      AND (
        job_runs.scope = 'all'
        OR job_runs.company_id = c.id
      )
    )
  );

-- Users can view tasks for their organization's companies
CREATE POLICY "Users can view tasks for their org"
  ON job_run_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN companies c ON c.organization_id = p.organization_id
      WHERE p.id = auth.uid()
      AND job_run_tasks.company_id = c.id
    )
  );

-- Editors and admins can create job runs
CREATE POLICY "Editors can create job runs"
  ON job_runs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('editor', 'admin')
    )
  );

-- Admins can update job runs (for status updates, etc.)
CREATE POLICY "Admins can update job runs"
  ON job_runs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- Admins can update tasks (for progress updates)
CREATE POLICY "Admins can update tasks"
  ON job_run_tasks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- Function to update job run stats from tasks
CREATE OR REPLACE FUNCTION update_job_run_stats(job_run_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE job_runs
  SET
    total_companies = (
      SELECT COUNT(*) FROM job_run_tasks WHERE job_run_id = job_run_uuid
    ),
    completed_companies = (
      SELECT COUNT(*) FROM job_run_tasks 
      WHERE job_run_id = job_run_uuid AND status = 'completed'
    ),
    failed_companies = (
      SELECT COUNT(*) FROM job_run_tasks 
      WHERE job_run_id = job_run_uuid AND status = 'failed'
    ),
    total_new_jobs = (
      SELECT COALESCE(SUM(new_jobs), 0) FROM job_run_tasks 
      WHERE job_run_id = job_run_uuid
    ),
    total_updated_jobs = (
      SELECT COALESCE(SUM(updated_jobs), 0) FROM job_run_tasks 
      WHERE job_run_id = job_run_uuid
    ),
    total_closed_jobs = (
      SELECT COALESCE(SUM(closed_jobs), 0) FROM job_run_tasks 
      WHERE job_run_id = job_run_uuid
    ),
    total_insights = (
      SELECT COALESCE(SUM(insights_generated), 0) FROM job_run_tasks 
      WHERE job_run_id = job_run_uuid
    )
  WHERE id = job_run_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
