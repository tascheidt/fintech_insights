import { createAdminClient } from "@/lib/supabase/admin";
import { processCollectionTask } from "./processor";
import { processAnalysisTask } from "./analyzer";
import { updateJobRunStats } from "./progress";
import type {
  JobRunTrigger,
  JobType,
  JobRunResult,
  TaskStage,
} from "./types";

/**
 * Create a new job run with tasks for specified companies
 */
export async function createJobRun(options: {
  jobType: JobType;
  triggerType: JobRunTrigger;
  triggeredBy?: string;
  companyIds: string[];
  parentJobRunId?: string;
}): Promise<string> {
  const supabase = createAdminClient();

  const scope = options.companyIds.length === 1 ? 'single' : 'all';
  const companyId = scope === 'single' ? options.companyIds[0] : null;

  // Create job run
  const { data: jobRun, error } = await supabase
    .from('job_runs')
    .insert({
      job_type: options.jobType,
      parent_job_run_id: options.parentJobRunId || null,
      trigger_type: options.triggerType,
      triggered_by: options.triggeredBy || null,
      scope,
      company_id: companyId,
      status: 'pending',
      total_companies: options.companyIds.length,
    })
    .select('id')
    .single();

  if (error || !jobRun) {
    throw new Error(`Failed to create job run: ${error?.message || 'Unknown error'}`);
  }

  // Create tasks for each company
  const tasks = options.companyIds.map((companyId) => ({
    job_run_id: jobRun.id,
    company_id: companyId,
    status: 'pending' as const,
  }));

  const { error: tasksError } = await supabase
    .from('job_run_tasks')
    .insert(tasks);

  if (tasksError) {
    // Clean up job run if tasks creation fails
    await supabase.from('job_runs').delete().eq('id', jobRun.id);
    throw new Error(`Failed to create tasks: ${tasksError.message}`);
  }

  return jobRun.id;
}

/**
 * Execute a collection job (Phase 1: scrape + ingest)
 */
export async function executeCollectionJob(jobRunId: string): Promise<JobRunResult> {
  const supabase = createAdminClient();

  // Update job run status to running
  await supabase
    .from('job_runs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', jobRunId);

  // Get all tasks for this job run (with retry logic to handle async creation)
  let tasks: Array<{ id: string }> | null = null;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const { data, error } = await supabase
      .from('job_run_tasks')
      .select('id')
      .eq('job_run_id', jobRunId)
      .order('started_at', { ascending: true, nullsFirst: true });
    
    if (error) {
      throw new Error(`Failed to fetch tasks: ${error.message}`);
    }
    
    if (data && data.length > 0) {
      tasks = data;
      break;
    }
    
    attempts++;
    if (attempts < maxAttempts) {
      // Wait 100ms before retrying
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  if (!tasks || tasks.length === 0) {
    throw new Error(`No tasks found for job run ${jobRunId} after ${maxAttempts} attempts`);
  }

  let completedCount = 0;
  let failedCount = 0;

  // Process each task
  for (const task of tasks) {
    try {
      await processCollectionTask(task.id);
      completedCount++;
    } catch (error) {
      console.error(`Task ${task.id} failed:`, error);
      failedCount++;
    }

    // Update aggregate stats after each task
    await updateJobRunStats(jobRunId);
  }

  // Determine final status
  const finalStatus = failedCount === 0 ? 'completed' : failedCount === tasks.length ? 'failed' : 'completed';

  // Update job run status
  await supabase
    .from('job_runs')
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobRunId);

  // Get final stats
  const { data: jobRun } = await supabase
    .from('job_runs')
    .select('*')
    .eq('id', jobRunId)
    .single();

  return {
    jobRunId,
    status: finalStatus,
    stats: {
      totalCompanies: jobRun?.total_companies || 0,
      completedCompanies: completedCount,
      failedCompanies: failedCount,
      totalNewJobs: jobRun?.total_new_jobs || 0,
      totalUpdatedJobs: jobRun?.total_updated_jobs || 0,
      totalClosedJobs: jobRun?.total_closed_jobs || 0,
      totalInsights: jobRun?.total_insights || 0,
    },
  };
}

/**
 * Execute an analysis job (Phase 2: analyze)
 */
export async function executeAnalysisJob(jobRunId: string): Promise<JobRunResult> {
  const supabase = createAdminClient();

  // Update job run status to running
  await supabase
    .from('job_runs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', jobRunId);

  // Get all tasks for this job run (with retry logic to handle async creation)
  let tasks: Array<{ id: string; pending_analysis_job_ids: string[] | null }> | null = null;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const { data, error } = await supabase
      .from('job_run_tasks')
      .select('id, pending_analysis_job_ids')
      .eq('job_run_id', jobRunId)
      .order('started_at', { ascending: true, nullsFirst: true });
    
    if (error) {
      throw new Error(`Failed to fetch tasks: ${error.message}`);
    }
    
    if (data && data.length > 0) {
      tasks = data;
      break;
    }
    
    attempts++;
    if (attempts < maxAttempts) {
      // Wait 100ms before retrying
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  if (!tasks || tasks.length === 0) {
    throw new Error(`No tasks found for job run ${jobRunId} after ${maxAttempts} attempts`);
  }

  let completedCount = 0;
  let failedCount = 0;

  // Process each task
  for (const task of tasks) {
    // Skip if no jobs to analyze
    if (!task.pending_analysis_job_ids || task.pending_analysis_job_ids.length === 0) {
      // Mark as skipped
      await supabase
        .from('job_run_tasks')
        .update({
          status: 'skipped',
          completed_at: new Date().toISOString(),
        })
        .eq('id', task.id);
      completedCount++;
      continue;
    }

    try {
      await processAnalysisTask(task.id);
      completedCount++;
    } catch (error) {
      console.error(`Task ${task.id} failed:`, error);
      failedCount++;
    }

    // Update aggregate stats after each task
    await updateJobRunStats(jobRunId);
  }

  // Determine final status
  const finalStatus = failedCount === 0 ? 'completed' : failedCount === tasks.length ? 'failed' : 'completed';

  // Update job run status
  await supabase
    .from('job_runs')
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobRunId);

  // Get final stats
  const { data: jobRun } = await supabase
    .from('job_runs')
    .select('*')
    .eq('id', jobRunId)
    .single();

  return {
    jobRunId,
    status: finalStatus,
    stats: {
      totalCompanies: jobRun?.total_companies || 0,
      completedCompanies: completedCount,
      failedCompanies: failedCount,
      totalNewJobs: jobRun?.total_new_jobs || 0,
      totalUpdatedJobs: jobRun?.total_updated_jobs || 0,
      totalClosedJobs: jobRun?.total_closed_jobs || 0,
      totalInsights: jobRun?.total_insights || 0,
    },
  };
}

/**
 * Called after collection completes - creates analysis job if needed
 */
export async function triggerAnalysisJobIfNeeded(
  collectionJobRunId: string
): Promise<string | null> {
  const supabase = createAdminClient();

  // Get all tasks from collection job
  const { data: tasks } = await supabase
    .from('job_run_tasks')
    .select('company_id, pending_analysis_job_ids')
    .eq('job_run_id', collectionJobRunId);

  if (!tasks || tasks.length === 0) {
    return null;
  }

  // Find companies that have pending analysis
  const companiesNeedingAnalysis = tasks
    .filter((task) => task.pending_analysis_job_ids && task.pending_analysis_job_ids.length > 0)
    .map((task) => task.company_id);

  if (companiesNeedingAnalysis.length === 0) {
    return null;
  }

  // Create analysis job
  const analysisJobRunId = await createJobRun({
    jobType: 'analyze',
    triggerType: 'cron', // Analysis jobs are always triggered by system
    companyIds: companiesNeedingAnalysis,
    parentJobRunId: collectionJobRunId,
  });

  // Copy pending_analysis_job_ids to analysis tasks
  // Wait a moment for tasks to be created
  await new Promise(resolve => setTimeout(resolve, 100));

  for (const task of tasks) {
    if (task.pending_analysis_job_ids && task.pending_analysis_job_ids.length > 0) {
      await supabase
        .from('job_run_tasks')
        .update({
          pending_analysis_job_ids: task.pending_analysis_job_ids,
        })
        .eq('job_run_id', analysisJobRunId)
        .eq('company_id', task.company_id);
    }
  }

  // Execute analysis job asynchronously
  executeAnalysisJob(analysisJobRunId).catch(console.error);

  return analysisJobRunId;
}

/**
 * Resume a failed/partial job run (skip completed tasks)
 */
export async function resumeJobRun(jobRunId: string): Promise<JobRunResult> {
  const supabase = createAdminClient();

  // Get job run
  const { data: jobRun } = await supabase
    .from('job_runs')
    .select('job_type')
    .eq('id', jobRunId)
    .single();

  if (!jobRun) {
    throw new Error(`Job run ${jobRunId} not found`);
  }

  if (jobRun.job_type === 'collect') {
    return executeCollectionJob(jobRunId);
  } else {
    return executeAnalysisJob(jobRunId);
  }
}

/**
 * Retry a specific failed task from a given stage
 */
export async function retryTask(taskId: string, fromStage?: TaskStage): Promise<void> {
  const supabase = createAdminClient();

  // Get task and job run
  const { data: task } = await supabase
    .from('job_run_tasks')
    .select('job_run_id, job_runs(job_type)')
    .eq('id', taskId)
    .single();

  if (!task || !task.job_runs) {
    throw new Error(`Task ${taskId} not found`);
  }

  const jobType = (task.job_runs as { job_type: JobType }).job_type;

  // Reset task status
  await supabase
    .from('job_run_tasks')
    .update({
      status: 'pending',
      error_message: null,
      error_stage: null,
    })
    .eq('id', taskId);

  if (jobType === 'collect') {
    const startFromStage = fromStage === 'ingest' ? 'ingest' : undefined;
    await processCollectionTask(taskId, { startFromStage });
  } else {
    await processAnalysisTask(taskId);
  }
}
