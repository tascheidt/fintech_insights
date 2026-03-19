import { createAdminClient } from "@/lib/supabase/admin";
import { fetchJobs, jobToRow, type JobData, isBrowserScraper } from "@/lib/scrapers";
import { triggerScrapeWorkflow } from "@/lib/github";
import type { Browser } from "puppeteer-core";
import type { Company, IngestResult } from "./types";
import { updateTaskProgress } from "./progress";
import { extractJobStructure, normalizeJobTitle, isValidDepartment, isValidLocation } from "@/lib/analysis/structure";
import {
  getActiveJobStructureAiConfig,
  type JobStructureAiConfig,
} from "@/lib/ai/prompt-config";

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
 * Extract Silver Layer structure and update job posting
 * This runs asynchronously and doesn't block the ingestion pipeline
 */
export async function extractAndUpdateStructure(
  jobId: string,
  jobTitle: string,
  description: string,
  rawDepartment?: string | null,
  rawLocation?: string | null,
  config?: JobStructureAiConfig
): Promise<void> {
  const supabase = createAdminClient();

  // Skip if no description available
  if (!description || description.trim().length === 0) {
    return;
  }

  try {
    // Extract structured data (pass raw department as context)
    // Always extract location from description - description is source of truth
    const structure = await extractJobStructure(jobTitle, description, rawDepartment, {
      config,
    });

    if (!structure) {
      // Extraction failed, but continue - we'll still have the raw data
      return;
    }

    // Normalize title
    const normalizedTitle = normalizeJobTitle(jobTitle);

    // Validate and clean department field - set to null if invalid
    const cleanedDepartment = isValidDepartment(rawDepartment) ? rawDepartment : null;
    const finalDepartment = cleanedDepartment || structure.standardized_department || null;

    // Handle location: always use AI-extracted location from description
    // Validate scraper-provided location - if invalid, set to null
    const cleanedLocation = isValidLocation(rawLocation) ? rawLocation : null;
    
    // Use structured location from AI extraction (always from description)
    const locationStructured = structure.location_structured;
    
    // Generate formatted location string from structured data
    // Prefer AI-extracted formatted string, fallback to generating from components
    let formattedLocation: string | null = null;
    if (locationStructured?.formatted) {
      formattedLocation = locationStructured.formatted;
    } else if (locationStructured) {
      // Generate formatted string from components
      const parts: string[] = [];
      if (locationStructured.city) parts.push(locationStructured.city);
      if (locationStructured.state) parts.push(locationStructured.state);
      if (locationStructured.country) parts.push(locationStructured.country);
      formattedLocation = parts.length > 0 ? parts.join(', ') : null;
    }
    
    // If no AI-extracted location, use cleaned scraper location (if valid)
    // Otherwise set to null
    const finalLocation = formattedLocation || cleanedLocation || null;

    // Update job posting with extracted structure
    await supabase
      .from('job_postings')
      .update({
        summary: structure.summary,
        seniority_level: structure.seniority_level,
        salary_min: structure.salary_min,
        salary_max: structure.salary_max,
        salary_currency: structure.salary_currency,
        tech_stack: structure.tech_stack,
        keywords: structure.keywords || [],
        standardized_department: structure.standardized_department,
        function_category: structure.function_category,
        normalized_title: normalizedTitle,
        // Prefer validated source department, fallback to standardized extraction
        department: finalDepartment,
        // Store structured location (always from AI extraction)
        location_structured: locationStructured,
        // Use formatted location from structured data, or cleaned scraper location, or null
        location: finalLocation,
      })
      .eq('id', jobId);
  } catch (error) {
    // Log error but don't throw - ingestion should continue even if extraction fails
    console.error(`Error extracting structure for job ${jobId}:`, error);
  }
}

/**
 * Stage 2: Ingest - Diff and upsert jobs to database
 * Updates task: new_jobs, updated_jobs, closed_jobs, pending_analysis_job_ids, stage_progress.ingest
 * Also extracts Silver Layer structure for each job
 */
export async function runIngestStage(
  taskId: string,
  company: Company,
  jobs: JobData[],
  onProgress?: (processed: number, total: number) => void,
  config?: JobStructureAiConfig
): Promise<IngestResult> {
  const supabase = createAdminClient();
  const activeConfig = config ?? await getActiveJobStructureAiConfig();

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
    const extractionPromises: Promise<void>[] = [];

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
        // Note: location will be updated by extractAndUpdateStructure with validated/AI-extracted value
        // For now, validate scraper location and set to null if invalid (will be replaced by AI extraction)
        const validatedLocation = isValidLocation(row.location) ? row.location : null;
        await supabase
          .from('job_postings')
          .update({
            last_seen_date: row.last_seen_date,
            description_html: row.description_html,
            description_text: row.description_text,
            department: row.department,
            location: validatedLocation, // Temporary - will be replaced by AI extraction
            location_type: row.location_type,
            commitment: row.commitment,
            url: row.url,
            posted_date: row.posted_date,
          })
          .eq('id', existingId);
        updatedJobs++;

        // Queue Silver Layer extraction for updated jobs
        // Pass raw location for validation (AI will extract from description)
        if (row.description_text) {
          extractionPromises.push(
            extractAndUpdateStructure(
              existingId,
              job.title,
              row.description_text,
              row.department,
              row.location,
              activeConfig
            )
          );
        }
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
          // Track all new jobs for analysis
          newJobIds.push(inserted.id);

          // Queue Silver Layer extraction for new jobs
          // Pass raw location for validation (AI will extract from description)
          if (row.description_text) {
            extractionPromises.push(
              extractAndUpdateStructure(
                inserted.id,
                job.title,
                row.description_text,
                row.department,
                row.location,
                activeConfig
              )
            );
          }
        }
      }

      processed++;
      if (onProgress) {
        onProgress(processed, total);
      }
    }

    // Wait for all Silver Layer extractions to complete (or fail gracefully)
    // Extractions run in parallel but must complete before ingestion is marked as done
    // This ensures department, location, and function_category fields are populated
    if (extractionPromises.length > 0) {
      const results = await Promise.allSettled(extractionPromises);
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        console.warn(
          `Silver Layer extraction: ${failed} of ${extractionPromises.length} jobs failed`
        );
      }
    }

    // Mark jobs as closed if no longer in feed
    // Only update jobs that are currently active to avoid overwriting
    // closed_date on already-closed jobs every collection run
    for (const [extId, jobId] of existingMap) {
      if (!fetchedIds.has(extId)) {
        const { count } = await supabase
          .from('job_postings')
          .update({
            is_active: false,
            closed_date: new Date().toISOString(),
          })
          .eq('id', jobId)
          .eq('is_active', true);
        if (count && count > 0) {
          closedJobs++;
        }
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
    .select('company_id, scraped_data')
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
      // Check if this is a browser-based scraper that should be offloaded
      if (isBrowserScraper(company.ats_type)) {
        // Offload heavy browser scraping to GitHub Actions
        console.log("Offloaded heavy scrape to GitHub Actions");
        
        try {
          // Pass taskId so GitHub Actions updates the existing task instead of creating a new one
          await triggerScrapeWorkflow(company.id, taskId);
          
          // Update task to indicate it's been offloaded
          await supabase
            .from('job_run_tasks')
            .update({
              status: 'running',
              current_stage: 'scrape',
              stage_progress: {
                scrape: {
                  status: 'running',
                  startedAt: new Date().toISOString(),
                  offloaded_to_github: true,
                },
              },
            })
            .eq('id', taskId);
          
          // Return early - GitHub Actions will handle the scraping and update this task
          return;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`❌ Failed to trigger GitHub Actions workflow: ${errorMessage}`);
          
          // Update task to failed
          await supabase
            .from('job_run_tasks')
            .update({
              status: 'failed',
              error_message: `Failed to offload to GitHub Actions: ${errorMessage}`,
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
      
      // Run scrape stage locally (API-based scrapers)
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
