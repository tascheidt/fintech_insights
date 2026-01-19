import { createAdminClient } from "@/lib/supabase/admin";
import { fetchJobs, jobToRow, type JobData } from "@/lib/scrapers";
import type { Browser } from "puppeteer-core";
import type { Company, IngestResult } from "./types";
import { updateTaskProgress } from "./progress";

/**
 * Stage 1: Scrape - Fetch raw data from ATS
 * Updates task: scraped_data, jobs_fetched, stage_progress.scrape
 */
export async function runScrapeStage(
  taskId: string,
  company: Company,
  browser?: Browser
): Promise<JobData[]> {
  const supabase = createAdminClient();

  // Update stage to running
  await updateTaskProgress(taskId, 'scrape', {
    status: 'running',
    startedAt: new Date().toISOString(),
  });

  try {
    // Fetch jobs from ATS
    const jobs = await fetchJobs(
      company.ats_type,
      company.ats_identifier || '',
      company.careers_url || undefined,
      browser
    );

    // Store scraped data and update task
    await supabase
      .from('job_run_tasks')
      .update({
        scraped_data: jobs,
        jobs_fetched: jobs.length,
        stage_progress: {
          scrape: {
            status: 'completed',
            completedAt: new Date().toISOString(),
            jobs_fetched: jobs.length,
          },
        },
      })
      .eq('id', taskId);

    return jobs;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Update stage to failed
    await supabase
      .from('job_run_tasks')
      .update({
        status: 'failed',
        error_message: errorMessage,
        error_stage: 'scrape',
        stage_progress: {
          scrape: {
            status: 'failed',
            error: errorMessage,
          },
        },
      })
      .eq('id', taskId);

    throw error;
  }
}

/**
 * Stage 2: Ingest - Diff and upsert jobs to database
 * Updates task: new_jobs, updated_jobs, closed_jobs, pending_analysis_job_ids, stage_progress.ingest
 */
export async function runIngestStage(
  taskId: string,
  company: Company,
  jobs: JobData[],
  onProgress?: (processed: number, total: number) => void
): Promise<IngestResult> {
  const supabase = createAdminClient();

  // Update stage to running
  await updateTaskProgress(taskId, 'ingest', {
    status: 'running',
    startedAt: new Date().toISOString(),
  });

  try {
    // Get existing job postings
    const { data: existing } = await supabase
      .from('job_postings')
      .select('id, external_id')
      .eq('company_id', company.id);

    const existingMap = new Map((existing ?? []).map((e) => [e.external_id, e.id]));
    const fetchedIds = new Set(jobs.map((j) => j.external_id));

    let newJobs = 0;
    let updatedJobs = 0;
    let closedJobs = 0;
    const newJobIds: string[] = [];

    const total = jobs.length;
    let processed = 0;

    // Process each job
    for (const job of jobs) {
      const row = {
        ...jobToRow(job),
        company_id: company.id,
        last_seen_date: new Date().toISOString(),
        is_active: true,
      };

      const existingId = existingMap.get(job.external_id);

      if (existingId) {
        // Update existing job
        await supabase
          .from('job_postings')
          .update({
            last_seen_date: row.last_seen_date,
            description_html: row.description_html,
            description_text: row.description_text,
            department: row.department,
            location: row.location,
            location_type: row.location_type,
            commitment: row.commitment,
            url: row.url,
            posted_date: row.posted_date,
          })
          .eq('id', existingId);
        updatedJobs++;
      } else {
        // Insert new job
        const { data: inserted } = await supabase
          .from('job_postings')
          .insert({
            ...row,
            first_seen_date: row.last_seen_date,
          })
          .select('id')
          .single();

        if (inserted?.id) {
          newJobs++;
          // Only track for analysis if company is tracked for strategy
          if (company.track_for_strategy) {
            newJobIds.push(inserted.id);
          }
        }
      }

      processed++;
      if (onProgress) {
        onProgress(processed, total);
      }
    }

    // Mark jobs as closed if no longer in feed
    for (const [extId, jobId] of existingMap) {
      if (!fetchedIds.has(extId)) {
        await supabase
          .from('job_postings')
          .update({
            is_active: false,
            closed_date: new Date().toISOString(),
          })
          .eq('id', jobId);
        closedJobs++;
      }
    }

    // Update company's last_collected_at
    await supabase
      .from('companies')
      .update({ last_collected_at: new Date().toISOString() })
      .eq('id', company.id);

    // Update task with results
    await supabase
      .from('job_run_tasks')
      .update({
        new_jobs: newJobs,
        updated_jobs: updatedJobs,
        closed_jobs: closedJobs,
        pending_analysis_job_ids: newJobIds,
        stage_progress: {
          ingest: {
            status: 'completed',
            completedAt: new Date().toISOString(),
            processed: total,
            total: total,
          },
        },
      })
      .eq('id', taskId);

    return {
      newJobIds,
      updated: updatedJobs,
      closed: closedJobs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Update stage to failed
    await supabase
      .from('job_run_tasks')
      .update({
        status: 'failed',
        error_message: errorMessage,
        error_stage: 'ingest',
        stage_progress: {
          ingest: {
            status: 'failed',
            error: errorMessage,
          },
        },
      })
      .eq('id', taskId);

    throw error;
  }
}

/**
 * Run collection stages for a task (scrape + ingest)
 */
export async function processCollectionTask(
  taskId: string,
  options?: { startFromStage?: 'scrape' | 'ingest' }
): Promise<void> {
  const supabase = createAdminClient();

  // Get task
  const { data: task } = await supabase
    .from('job_run_tasks')
    .select('company_id')
    .eq('id', taskId)
    .single();

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  // Get company
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', task.company_id)
    .single();

  if (!company) {
    throw new Error(`Company ${task.company_id} not found`);
  }

  // Update task status to running
  await supabase
    .from('job_run_tasks')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  try {
    let jobs: JobData[];

    // Stage 1: Scrape (or use stored data)
    if (options?.startFromStage === 'ingest' && task.scraped_data) {
      // Use stored scraped data
      jobs = task.scraped_data as unknown as JobData[];
    } else {
      // Run scrape stage
      jobs = await runScrapeStage(taskId, company, undefined);
    }

    // Stage 2: Ingest
    await runIngestStage(taskId, company, jobs, (processed, total) => {
      // Update progress
      updateTaskProgress(taskId, 'ingest', {
        processed,
        total,
      }).catch(console.error);
    });

    // Mark task as completed
    await supabase
      .from('job_run_tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        current_stage: 'done',
      })
      .eq('id', taskId);
  } catch (error) {
    // Task failure is already handled in stage functions
    throw error;
  }
}
