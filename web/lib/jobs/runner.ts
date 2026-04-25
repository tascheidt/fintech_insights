import { createAdminClient } from "@/lib/supabase/admin";
import { STALE_JOB_THRESHOLD_MS } from "./constants";
import { processCollectionTask } from "./processor";
import { processAnalysisTask } from "./analyzer";
import { updateJobRunStats } from "./progress";
import { fetchCompanyNewsContext } from "@/lib/analysis/company-news";
import { buildTechStackStrategicContext } from "@/lib/analysis/strategic-context";
import { aggregateTechStackFromJobs } from "@/lib/ai/tech-stack-aggregation";
import { enrichTechStackWithAnalysis } from "@/lib/ai/tech-stack-extraction";
import { getActiveTechStackAiConfig } from "@/lib/ai/prompt-config";
import type {
  JobRunTrigger,
  JobType,
  JobRunResult,
  TaskStage,
} from "./types";
import { log } from "@/lib/log";

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
      completed_at: null,
    })
    .eq('id', jobRunId);

  let completedCount = 0;
  let failedCount = 0;
  let finalStatus: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' = 'failed';

  try {
    // Inline stale cleanup: tasks stuck in "running" for >20 minutes are failed tasks
    // (e.g. Vercel killed the function mid-run, or GitHub Actions never called back)
    const staleThreshold = new Date(Date.now() - STALE_JOB_THRESHOLD_MS).toISOString();
    await supabase
      .from('job_run_tasks')
      .update({
        status: 'failed',
        error_message: 'Task timed out (stuck in running state)',
        error_stage: 'timeout',
        completed_at: new Date().toISOString(),
      })
      .eq('job_run_id', jobRunId)
      .eq('status', 'running')
      .lt('started_at', staleThreshold);

    // Get resumable tasks (pending/failed only — running tasks were just cleaned up above)
    let tasks: Array<{ id: string }> | null = null;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const { data, error } = await supabase
        .from('job_run_tasks')
        .select('id')
        .eq('job_run_id', jobRunId)
        .in('status', ['pending', 'failed'])
        .order('started_at', { ascending: true, nullsFirst: true });

      if (error) throw new Error(`Failed to fetch tasks: ${error.message}`);

      if (data && data.length > 0) {
        tasks = data;
        break;
      }

      attempts++;
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (!tasks || tasks.length === 0) {
      // No resumable tasks — either all completed/running (GH Actions) or nothing to do.
      // Determine final status from existing task states.
      log.info(`No resumable tasks for job run ${jobRunId}, checking task states...`);
    } else {
      // Process resumable tasks
      for (const task of tasks) {
        try {
          await processCollectionTask(task.id);
          completedCount++;
        } catch (error) {
          log.error({ err: error }, `Task ${task.id} failed:`);
          failedCount++;
        }
        await updateJobRunStats(jobRunId);
      }
    }

    // Determine final status from all task states.
    // Tasks in "running" state are delegated to GitHub Actions — they don't block completion.
    const { data: taskStatuses } = await supabase
      .from('job_run_tasks')
      .select('status')
      .eq('job_run_id', jobRunId);

    const hasPending = (taskStatuses ?? []).some((t) => t.status === 'pending');
    const hasFailed = (taskStatuses ?? []).some((t) => t.status === 'failed');
    // "running" tasks are GH Actions delegated — treat the run as complete from our side
    finalStatus = hasPending ? 'running' : hasFailed ? 'failed' : 'completed';
  } catch (error) {
    // Ensure we always set a terminal status — never leave a job stuck in "running"
    log.error({ err: error }, `executeCollectionJob error for ${jobRunId}:`);
    finalStatus = 'failed';

    await supabase
      .from('job_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : String(error),
      })
      .eq('id', jobRunId);

    // Get stats and return even on error
    const { data: jobRun } = await supabase
      .from('job_runs').select('*').eq('id', jobRunId).single();
    return {
      jobRunId,
      status: 'failed',
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

  // Always set a terminal status
  await supabase
    .from('job_runs')
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobRunId);

  const { data: jobRun } = await supabase
    .from('job_runs').select('*').eq('id', jobRunId).single();

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
      log.error({ err: error }, `Task ${task.id} failed:`);
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
  executeAnalysisJob(analysisJobRunId).catch(log.error);

  return analysisJobRunId;
}

/**
 * Refresh news cache for companies that had new jobs in the collection run.
 * This pre-computes the expensive Gemini + web search calls so they're ready
 * for weekly digest generation.
 * 
 * @param collectionJobRunId - The collection job run ID to get active companies from
 * @param options - Configuration options
 */
export async function refreshNewsCacheForActiveCompanies(
  collectionJobRunId: string,
  options?: {
    /** Process companies in parallel (default: 2) */
    parallelism?: number;
    /** Only refresh if cache is missing or expired (default: true) */
    skipIfCached?: boolean;
  }
): Promise<{ refreshed: number; skipped: number; failed: number }> {
  const supabase = createAdminClient();
  const parallelism = options?.parallelism ?? 2;
  const skipIfCached = options?.skipIfCached ?? true;

  // Get tasks that had new jobs from the collection run
  const { data: tasks } = await supabase
    .from('job_run_tasks')
    .select('company_id, new_jobs')
    .eq('job_run_id', collectionJobRunId)
    .gt('new_jobs', 0);

  if (!tasks || tasks.length === 0) {
    log.info('No companies with new jobs, skipping news cache refresh');
    return { refreshed: 0, skipped: 0, failed: 0 };
  }

  const companyIds = tasks.map((t) => t.company_id);

  // Get company names
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .in('id', companyIds);

  if (!companies || companies.length === 0) {
    return { refreshed: 0, skipped: 0, failed: 0 };
  }

  // Check existing cache if skipIfCached is true
  let companiesToRefresh = companies;
  let skippedCount = 0;

  if (skipIfCached) {
    const { data: cached } = await supabase
      .from('company_news_cache')
      .select('company_id')
      .in('company_id', companyIds)
      .gt('expires_at', new Date().toISOString());

    const cachedIds = new Set((cached || []).map((c) => c.company_id));
    companiesToRefresh = companies.filter((c) => !cachedIds.has(c.id));
    skippedCount = companies.length - companiesToRefresh.length;
  }

  if (companiesToRefresh.length === 0) {
    log.info(`All ${companies.length} companies have valid cache, skipping refresh`);
    return { refreshed: 0, skipped: skippedCount, failed: 0 };
  }

  log.info(`Refreshing news cache for ${companiesToRefresh.length} companies (${skippedCount} already cached)...`);

  let refreshedCount = 0;
  let failedCount = 0;

  // Process in batches for controlled parallelism
  for (let i = 0; i < companiesToRefresh.length; i += parallelism) {
    const batch = companiesToRefresh.slice(i, i + parallelism);
    
    const results = await Promise.allSettled(
      batch.map(async (company) => {
        log.info(`Fetching news for ${company.name}...`);
        await fetchCompanyNewsContext(company.name, company.id, { forceRefresh: true });
        return company.name;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        refreshedCount++;
      } else {
        log.error({ err: result.reason }, 'News cache refresh failed:');
        failedCount++;
      }
    }
  }

  log.info(`News cache refresh complete: ${refreshedCount} refreshed, ${skippedCount} skipped, ${failedCount} failed`);
  return { refreshed: refreshedCount, skipped: skippedCount, failed: failedCount };
}

/**
 * Refresh tech stacks for companies that had new/updated jobs in a collection run.
 * Uses hybrid pipeline: DB aggregation (instant) + Gemini Pro enrichment.
 * Non-blocking: errors are logged but not propagated.
 */
export async function refreshTechStacksForCompanies(
  collectionJobRunId: string
): Promise<{ refreshed: number; skipped: number; failed: number }> {
  const supabase = createAdminClient();
  const PARALLELISM = 2;
  const STALENESS_DAYS = 7;
  const config = await getActiveTechStackAiConfig();

  // Get all companies from the collection run
  const { data: tasks } = await supabase
    .from('job_run_tasks')
    .select('company_id, new_jobs')
    .eq('job_run_id', collectionJobRunId);

  if (!tasks || tasks.length === 0) {
    log.info('No companies in collection run, skipping tech stack refresh');
    return { refreshed: 0, skipped: 0, failed: 0 };
  }

  const companyIds = tasks.map((t) => t.company_id);
  const companiesWithNewJobs = new Set(
    tasks.filter((t) => (t.new_jobs ?? 0) > 0).map((t) => t.company_id)
  );

  // Get companies with staleness check
  const staleDate = new Date(Date.now() - STALENESS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, tech_stack_generated_at')
    .in('id', companyIds);

  if (!companies || companies.length === 0) {
    return { refreshed: 0, skipped: 0, failed: 0 };
  }

  // Eligible if: never generated before OR (has new jobs AND stale)
  const eligible = companies.filter(
    (c) =>
      !c.tech_stack_generated_at ||
      (companiesWithNewJobs.has(c.id) && c.tech_stack_generated_at < staleDate)
  );
  const skippedCount = companies.length - eligible.length;

  if (eligible.length === 0) {
    log.info(`All ${companies.length} companies have fresh tech stacks, skipping refresh`);
    return { refreshed: 0, skipped: skippedCount, failed: 0 };
  }

  log.info(`Refreshing tech stacks for ${eligible.length} companies (${skippedCount} recently generated)...`);

  let refreshedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < eligible.length; i += PARALLELISM) {
    const batch = eligible.slice(i, i + PARALLELISM);

    const results = await Promise.allSettled(
      batch.map(async (company) => {
        log.info(`Aggregating tech stack for ${company.name}...`);
        const rawData = await aggregateTechStackFromJobs(company.id);

        if (rawData.technologies.length === 0) {
          log.info(`No tech data found for ${company.name}, skipping enrichment`);
          return;
        }

        const strategicContext = await buildTechStackStrategicContext(company.id);

        const enrichedStack = await enrichTechStackWithAnalysis(
          company.name,
          rawData.technologies,
          rawData.totalJobsAnalyzed,
          rawData.periodStart,
          rawData.periodEnd,
          strategicContext.context,
          config
        );

        await supabase
          .from('companies')
          .update({
            tech_stack: enrichedStack,
            tech_stack_generated_at: new Date().toISOString(),
          })
          .eq('id', company.id);

        log.info(`Tech stack refreshed for ${company.name}`);
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        refreshedCount++;
      } else {
        log.error({ err: result.reason }, 'Tech stack refresh failed:');
        failedCount++;
      }
    }
  }

  log.info(`Tech stack refresh complete: ${refreshedCount} refreshed, ${skippedCount} skipped, ${failedCount} failed`);
  return { refreshed: refreshedCount, skipped: skippedCount, failed: failedCount };
}

/**
 * Backfill tech stacks for all active companies that have never had one generated.
 * Used for one-time backfills without needing a collection job run ID.
 */
export async function backfillTechStacksForAllCompanies(): Promise<{ refreshed: number; skipped: number; failed: number }> {
  const supabase = createAdminClient();
  const PARALLELISM = 2;
  const config = await getActiveTechStackAiConfig();

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, tech_stack_generated_at')
    .eq('is_active', true);

  if (!companies || companies.length === 0) {
    return { refreshed: 0, skipped: 0, failed: 0 };
  }

  const eligible = companies.filter((c) => !c.tech_stack_generated_at);
  const skippedCount = companies.length - eligible.length;

  if (eligible.length === 0) {
    log.info('All companies already have tech stacks, skipping backfill');
    return { refreshed: 0, skipped: skippedCount, failed: 0 };
  }

  log.info(`Backfilling tech stacks for ${eligible.length} companies...`);

  let refreshedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < eligible.length; i += PARALLELISM) {
    const batch = eligible.slice(i, i + PARALLELISM);

    const results = await Promise.allSettled(
      batch.map(async (company) => {
        log.info(`Aggregating tech stack for ${company.name}...`);
        const rawData = await aggregateTechStackFromJobs(company.id);

        if (rawData.technologies.length === 0) {
          log.info(`No tech data found for ${company.name}, skipping enrichment`);
          return;
        }

        const strategicContext = await buildTechStackStrategicContext(company.id);

        const enrichedStack = await enrichTechStackWithAnalysis(
          company.name,
          rawData.technologies,
          rawData.totalJobsAnalyzed,
          rawData.periodStart,
          rawData.periodEnd,
          strategicContext.context,
          config
        );

        await supabase
          .from('companies')
          .update({
            tech_stack: enrichedStack,
            tech_stack_generated_at: new Date().toISOString(),
          })
          .eq('id', company.id);

        log.info(`Tech stack backfilled for ${company.name}`);
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        refreshedCount++;
      } else {
        log.error({ err: result.reason }, 'Tech stack backfill failed:');
        failedCount++;
      }
    }
  }

  log.info(`Tech stack backfill complete: ${refreshedCount} refreshed, ${skippedCount} skipped, ${failedCount} failed`);
  return { refreshed: refreshedCount, skipped: skippedCount, failed: failedCount };
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

  // Supabase joins return arrays, so we need to access the first element
  const jobRuns = task.job_runs as { job_type: JobType }[] | null;
  if (!jobRuns || jobRuns.length === 0) {
    throw new Error(`Job run not found for task ${taskId}`);
  }
  const jobType = jobRuns[0].job_type;

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
