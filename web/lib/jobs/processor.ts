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
import { createHash } from "crypto";
import { log } from "@/lib/log";

/**
 * SHA-1 hex digest of a job description. Used as a cheap content fingerprint
 * so the ingestion pipeline can skip `extractAndUpdateStructure` when a
 * scraped description matches what we already stored. Matches the SQL
 * `encode(digest(description_text, 'sha1'), 'hex')` used by the backfill
 * migration so hashes produced here and in-database are interchangeable.
 */
function hashDescription(description: string): string {
  return createHash("sha1").update(description).digest("hex");
}

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
    log.error({ err: error }, `Error extracting structure for job ${jobId}:`);
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
    // Sub-brand override routing: scrapers can tag a job with
    // `companySlugOverride` to route it to a different companies row
    // that shares the parent's ATS (e.g. Simplii on CIBC's Workday).
    // Resolve overrides up-front so we can build per-company maps.
    const overrideSlugs = new Set<string>();
    for (const j of jobs) {
      if (j.companySlugOverride && j.companySlugOverride !== company.slug) {
        overrideSlugs.add(j.companySlugOverride);
      }
    }
    const overrideCompanies = new Map<string, { id: string; name: string }>();
    if (overrideSlugs.size > 0) {
      const { data: rows } = await supabase
        .from('companies')
        .select('id, slug, name, parent_company_id')
        .in('slug', Array.from(overrideSlugs))
        .eq('parent_company_id', company.id);
      for (const r of rows ?? []) {
        overrideCompanies.set(r.slug as string, { id: r.id as string, name: r.name as string });
      }
      const missing = Array.from(overrideSlugs).filter((s) => !overrideCompanies.has(s));
      if (missing.length > 0) {
        log.warn(
          { parent: company.slug, missingChildSlugs: missing },
          '[ingest] companySlugOverride references unknown sub-brand(s); falling back to parent'
        );
      }
    }
    const resolveCompanyId = (job: JobData): string => {
      if (job.companySlugOverride) {
        const child = overrideCompanies.get(job.companySlugOverride);
        if (child) return child.id;
      }
      return company.id;
    };

    // Load existing job_postings for parent + every resolved sub-brand
    // so per-company existingMap/fetchedIds (used by closure detection)
    // are computed correctly. Paginated because PostgREST caps a single
    // .select() at 1000 rows — RBC/TD/Scotia each carry >1000 active
    // postings, so the unpaginated query silently dropped dedup entries
    // and the next scrape re-INSERTed already-known rows.
    const ingestCompanyIds = [company.id, ...Array.from(overrideCompanies.values()).map((c) => c.id)];
    const PAGE = 1000;
    const existing: Array<{
      id: string;
      external_id: string;
      description_hash: string | null;
      company_id: string;
    }> = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data: page, error: pageError } = await supabase
        .from('job_postings')
        .select('id, external_id, description_hash, company_id')
        .in('company_id', ingestCompanyIds)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (pageError) {
        throw new Error(`Failed to load existing postings for dedup: ${pageError.message}`);
      }
      if (!page || page.length === 0) break;
      existing.push(...(page as typeof existing));
      if (page.length < PAGE) break;
    }

    const existingByCompany = new Map<
      string,
      Map<string, { id: string; descriptionHash: string | null }>
    >();
    for (const cid of ingestCompanyIds) existingByCompany.set(cid, new Map());
    for (const e of existing ?? []) {
      const m = existingByCompany.get(e.company_id as string);
      if (!m) continue;
      m.set(e.external_id as string, {
        id: e.id as string,
        descriptionHash: (e.description_hash ?? null) as string | null,
      });
    }

    const fetchedByCompany = new Map<string, Set<string>>();
    for (const cid of ingestCompanyIds) fetchedByCompany.set(cid, new Set());
    for (const j of jobs) {
      const cid = resolveCompanyId(j);
      fetchedByCompany.get(cid)?.add(j.external_id);
    }

    let newJobs = 0;
    let updatedJobs = 0;
    let closedJobs = 0;
    let extractionsSkippedByHash = 0;
    const newJobIds: string[] = [];
    const extractionPromises: Promise<void>[] = [];
    const overrideRoutedCount = new Map<string, number>();

    const total = jobs.length;
    let processed = 0;

    // Process each job
    for (const job of jobs) {
      const targetCompanyId = resolveCompanyId(job);
      if (job.companySlugOverride && targetCompanyId !== company.id) {
        overrideRoutedCount.set(
          job.companySlugOverride,
          (overrideRoutedCount.get(job.companySlugOverride) ?? 0) + 1
        );
      }

      const row = {
        ...jobToRow(job),
        company_id: targetCompanyId,
        last_seen_date: new Date().toISOString(),
        is_active: true,
      };

      const existingEntry = existingByCompany.get(targetCompanyId)?.get(job.external_id);
      // Content fingerprint for the description_hash gate (Phase 2). A null
      // stored hash is treated as "changed" so the first scrape after deploy
      // still populates everything, matching the intent of the SQL backfill.
      const newDescriptionHash = row.description_text ? hashDescription(row.description_text) : null;

      if (existingEntry) {
        const existingId = existingEntry.id;
        const descriptionChanged =
          newDescriptionHash !== null && newDescriptionHash !== existingEntry.descriptionHash;
        // Update existing job
        // Note: location will be updated by extractAndUpdateStructure with validated/AI-extracted value
        // For now, validate scraper location and set to null if invalid (will be replaced by AI extraction)
        const validatedLocation = isValidLocation(row.location) ? row.location : null;
        // Re-open jobs that reappear in a scrape. Without this, a job
        // wrongly closed by a partial scrape (e.g. May 2026 Workday
        // pagination bug) stays closed forever — every subsequent scrape
        // refreshes `last_seen_date` but leaves `closed_date` / `is_active`
        // untouched, so the dashboard undercounts the live corpus.
        await supabase
          .from('job_postings')
          .update({
            last_seen_date: row.last_seen_date,
            description_html: row.description_html,
            description_text: row.description_text,
            description_hash: newDescriptionHash,
            department: row.department,
            location: validatedLocation, // Temporary - will be replaced by AI extraction
            location_type: row.location_type,
            commitment: row.commitment,
            url: row.url,
            posted_date: row.posted_date,
            is_active: true,
            closed_date: null,
          })
          .eq('id', existingId);
        updatedJobs++;

        // Queue Silver Layer extraction only when the description actually
        // changed (hash gate, Phase 2 cost win). Unchanged descriptions
        // skip the Gemini call entirely — this is the core saving.
        if (row.description_text && descriptionChanged) {
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
        } else if (row.description_text) {
          extractionsSkippedByHash++;
        }
      } else {
        // Insert new job
        const { data: inserted } = await supabase
          .from('job_postings')
          .insert({
            ...row,
            first_seen_date: row.last_seen_date,
            description_hash: newDescriptionHash,
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
        log.warn(
          `Silver Layer extraction: ${failed} of ${extractionPromises.length} jobs failed`
        );
      }
    }

    // Phase 2 telemetry: how many `extractAndUpdateStructure` calls did the
    // hash gate prevent? This is the daily-cost-saving signal; surfaces on
    // each collect run so we can track it without full Phase-5 telemetry.
    if (extractionsSkippedByHash > 0) {
      log.info(
        `Silver Layer extraction: hash gate skipped ${extractionsSkippedByHash} unchanged description(s) for ${company.name}`
      );
    }

    // Mark jobs as closed if no longer in feed. Runs per ingest-target
    // company (parent + every sub-brand we routed jobs into) — a job that
    // was last seen under CIBC but is now classified as Simplii would
    // otherwise be flagged "closed" forever under CIBC. Each company
    // closes only those of its own rows that didn't show up in this run.
    for (const cid of ingestCompanyIds) {
      const existingMap = existingByCompany.get(cid);
      const fetchedIds = fetchedByCompany.get(cid);
      if (!existingMap || !fetchedIds) continue;
      for (const [extId, entry] of existingMap) {
        if (!fetchedIds.has(extId)) {
          const { count } = await supabase
            .from('job_postings')
            .update({
              is_active: false,
              closed_date: new Date().toISOString(),
            })
            .eq('id', entry.id)
            .eq('is_active', true);
          if (count && count > 0) {
            closedJobs++;
          }
        }
      }
    }

    // Update last_collected_at on every ingest-target company (parent +
    // sub-brands). Sub-brands don't have their own scrape, so the parent's
    // run is the authoritative refresh signal.
    await supabase
      .from('companies')
      .update({ last_collected_at: new Date().toISOString() })
      .in('id', ingestCompanyIds);

    // Sub-brand routing telemetry.
    for (const [slug, n] of overrideRoutedCount) {
      log.info(
        { parent: company.slug, child: slug, routed: n },
        '[ingest] sub-brand routing'
      );
    }

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
            // Phase 2: surface the hash-gate saving in job_run_tasks so it's
            // queryable alongside new/updated/closed counts without a new column.
            extractionsSkippedByHash,
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
        log.info("Offloaded heavy scrape to GitHub Actions");
        
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
          log.error(`❌ Failed to trigger GitHub Actions workflow: ${errorMessage}`);
          
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
      }).catch(log.error);
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
