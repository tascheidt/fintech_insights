export type JobRunTrigger = 'cron' | 'manual' | 'admin';
export type JobRunScope = 'all' | 'single';
export type TaskStage = 'scrape' | 'ingest' | 'analyze' | 'done';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type JobRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type JobType = 'collect' | 'analyze';

export interface StageProgress {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  error?: string;
  [key: string]: unknown;
}

export interface TaskProgress {
  scrape?: StageProgress & { jobs_fetched?: number };
  ingest?: StageProgress & { processed?: number; total?: number };
  analyze?: StageProgress & { analyzed?: number; total?: number };
}

export interface JobRunTask {
  id: string;
  job_run_id: string;
  company_id: string;
  status: TaskStatus;
  started_at: string | null;
  completed_at: string | null;
  current_stage: TaskStage | null;
  stage_progress: TaskProgress;
  jobs_fetched: number;
  new_jobs: number;
  updated_jobs: number;
  closed_jobs: number;
  insights_generated: number;
  scraped_data: unknown;
  pending_analysis_job_ids: string[];
  error_message: string | null;
  error_stage: string | null;
}

export interface JobRun {
  id: string;
  job_type: JobType;
  parent_job_run_id: string | null;
  trigger_type: JobRunTrigger;
  triggered_by: string | null;
  scope: JobRunScope;
  company_id: string | null;
  status: JobRunStatus;
  started_at: string;
  completed_at: string | null;
  total_companies: number;
  completed_companies: number;
  failed_companies: number;
  total_new_jobs: number;
  total_updated_jobs: number;
  total_closed_jobs: number;
  total_insights: number;
  error_message: string | null;
}

export interface Company {
  id: string;
  name: string;
  ats_type: string;
  ats_identifier: string | null;
  careers_url: string | null;
  track_for_strategy: boolean;
  is_active: boolean;
}

export interface IngestResult {
  newJobIds: string[];
  updated: number;
  closed: number;
}

export interface AnalyzeResult {
  insightsGenerated: number;
}

export interface JobRunResult {
  jobRunId: string;
  status: JobRunStatus;
  stats: {
    totalCompanies: number;
    completedCompanies: number;
    failedCompanies: number;
    totalNewJobs: number;
    totalUpdatedJobs: number;
    totalClosedJobs: number;
    totalInsights: number;
  };
}
