/**
 * Heavy Scraper Script for GitHub Actions
 * 
 * Runs browser-based scraping using full puppeteer (not puppeteer-core)
 * for environments that support it (e.g., GitHub Actions).
 * 
 * Usage:
 *   COMPANY_ID=<uuid> [TASK_ID=<uuid>] npx tsx web/scripts/scrape-heavy.ts
 * 
 * Environment Variables:
 *   COMPANY_ID - UUID of the company to scrape (required)
 *   TASK_ID - UUID of existing task to update (optional, creates new task if not provided)
 *   NEXT_PUBLIC_SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key
 */

import puppeteer from "puppeteer";
import type { Browser } from "puppeteer-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchJobs } from "@/lib/scrapers";
import { runIngestStage } from "@/lib/jobs/processor";
import { triggerAnalysisForJobs } from "@/lib/jobs/runner";
import type { Company } from "@/lib/jobs/types";

/**
 * Render an unknown thrown value as a human-readable string for logs and the
 * `job_run_tasks.error_message` column. supabase-js / PostgREST reject with a
 * PLAIN object (`{ code, message, details, hint }`) that is NOT an Error
 * instance, so the old `error instanceof Error ? error.message : String(error)`
 * collapsed every DB rejection to the literal "[object Object]". That is
 * exactly what masked the real failures for days — Scotiabank's `57014`
 * (statement timeout on the oversized snapshot write) and TD's Supabase-origin
 * Cloudflare 520/521 both surfaced only as "[object Object]" in the task row.
 * Prefer a structured `[code] message`; fall back to JSON so we never store
 * "[object Object]" again.
 */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; code?: unknown; details?: unknown };
    const parts: string[] = [];
    if (typeof e.code === "string" && e.code) parts.push(`[${e.code}]`);
    if (typeof e.message === "string" && e.message) parts.push(e.message);
    if (parts.length === 0 && typeof e.details === "string" && e.details) {
      parts.push(e.details);
    }
    if (parts.length > 0) return parts.join(" ");
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/**
 * Classify an error as a transient Supabase outage worth waiting out, rather
 * than a permanent failure. A Supabase Postgres restart takes the DB offline
 * for a few seconds, then PostgREST rebuilds its schema cache — during that
 * ~20-40s window every query returns PGRST002 ("Could not query the database
 * for the schema cache") or PGRST001, and raw transport errors surface as
 * "fetch failed" / connection resets. The May 31 2026 TD ingest failure caught
 * exactly this window: a restart at ~06:52 UTC killed the ingest write seconds
 * later. updateTaskProgress rethrows these wrapped in an Error whose message
 * still carries the "schema cache" / "PGRST002" text, so we match on both the
 * structured `.code` and the message string.
 *
 * We also treat Postgres statement/lock timeouts as transient. Supabase pins
 * statement_timeout=8s (and lock_timeout=8s) on the API roles. During a heavy
 * ingest the per-row writes run while a sibling writer — the 06:00 collect /
 * analysis pass still touching the same company's rows — can hold a lock; a
 * single write then blocks past 8s and is cancelled mid-flight (57014, or
 * 55P03 if lock_timeout fires first). That killed the June 3 2026 Scotiabank
 * ingest (1,859 jobs scraped + enriched, then discarded). The ingest is
 * idempotent (upserts/updates by external id), so we ride out the contention
 * window with backoff exactly like a restart, rather than throwing away the
 * finished scrape. If a company times out every run, that's a systematic
 * signal to batch the per-row writes — not something a retry should hide.
 *
 * Finally, a Supabase origin hiccup can surface as a Cloudflare gateway 5xx
 * (520 "web server is returning an unknown error" / 521 / 522 / 523 / 524)
 * whose body is an HTML error page rather than a structured PGRST error — the
 * June 4 2026 TD ingest died on a bare 520. Those are transient platform
 * blips, so match the Cloudflare error-code/banner text too.
 */
function isTransientDbError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const msg = (typeof e.message === "string" ? e.message : "").toLowerCase();
  if (code === "PGRST002" || code === "PGRST001") return true;
  if (code === "57014" || code === "55P03") return true; // statement_timeout / lock_not_available
  return (
    msg.includes("schema cache") ||
    msg.includes("pgrst002") ||
    msg.includes("pgrst001") ||
    msg.includes("not accepting connections") ||
    msg.includes("the database system is starting up") ||
    msg.includes("fetch failed") ||
    msg.includes("connection reset") ||
    msg.includes("statement timeout") ||
    msg.includes("canceling statement due to") ||
    msg.includes("lock timeout") ||
    // Cloudflare gateway 5xx in front of the Supabase origin (HTML body).
    // NB: the real interstitial HTML does NOT contain the literal string
    // "error code 522" — it renders "Error 522", a "...timed out" banner, and a
    // `utm_source=errorcode_522` footer link. The June 18 2026 outage hit RBC/
    // CIBC with bare 522s that the old "error code 52x" matchers missed, so a
    // rideable origin blip was thrown as a hard failure. Match the strings that
    // actually appear: the CF 5xx footer marker (covers 520-524 uniformly) and
    // the 522 connection-timeout banner.
    msg.includes("5xx-error-landing") || // CF 5xx interstitial footer link (520-524)
    msg.includes("errorcode_52") || //   utm_source=errorcode_52x in that link
    msg.includes("origin web server timed out") || // 522 "What happened?" banner
    msg.includes("web server is returning an unknown error") || // 520
    msg.includes("web server is down") || // 521
    msg.includes("error code 520") ||
    msg.includes("error code 521") ||
    msg.includes("error code 522") ||
    msg.includes("error code 523") ||
    msg.includes("error code 524") ||
    msg.includes("bad gateway") ||
    msg.includes("gateway time-out") ||
    msg.includes("gateway timeout") ||
    msg.includes("service unavailable")
  );
}

/**
 * Run an async DB operation, retrying ONLY on transient outages (see
 * isTransientDbError). The budget is ~63s (6 attempts, 1→32s capped) so a
 * single Supabase restart + schema-cache reload is ridden out instead of
 * discarding a scrape whose work is already done — the 7s failure-path budget
 * below could not (May 28 & May 31 2026 TD ingest incidents). A non-transient
 * error throws immediately; the caller is responsible for the operation being
 * idempotent on retry (runIngestStage upserts by external id).
 */
async function withTransientRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 6
): Promise<T> {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isTransientDbError(e) || i === attempts) throw e;
      const backoffMs = Math.min(1000 * 2 ** (i - 1), 32000); // 1,2,4,8,16,32
      console.error(
        `⏳ ${label} hit a transient DB outage (attempt ${i}/${attempts}); retrying in ${backoffMs}ms: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  // Unreachable: the loop either returns or throws on the final attempt.
  throw new Error(`${label} exhausted transient retries`);
}

/**
 * Run a supabase write with bounded retries, retrying on ANY error (not just
 * transient ones). The failure-path writes that mark a task `failed` MUST be
 * resilient to transient DB outages — if those silently fail, the task stays
 * `running` until the next morning's heartbeat sweep marks it `Timed out`,
 * hiding the real error from the GH Actions logs (May 28 2026 TD incident).
 * Budget is ~63s (6 attempts, 1→32s capped) so the mark-failed write can itself
 * outlast a Supabase restart — the old 7s budget could not (May 31 2026).
 */
async function withRetry(
  label: string,
  fn: () => PromiseLike<{ error: { message?: string } | null }>,
  attempts = 6
): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const { error } = await fn();
      if (!error) return;
      console.error(
        `⚠️  ${label} failed (attempt ${i}/${attempts}): ${error.message ?? JSON.stringify(error)}`
      );
    } catch (e) {
      console.error(
        `⚠️  ${label} threw (attempt ${i}/${attempts}): ${e instanceof Error ? e.message : String(e)}`
      );
    }
    if (i < attempts) {
      const backoffMs = Math.min(1000 * 2 ** (i - 1), 32000); // 1,2,4,8,16,32
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  console.error(`❌ ${label} gave up after ${attempts} attempts; task may be stuck in 'running'.`);
}

async function markTaskFailed(
  supabase: SupabaseClient,
  taskId: string,
  jobRunId: string,
  errorMessage: string,
  stage: string
): Promise<void> {
  await withRetry(`mark task ${taskId} failed`, () =>
    supabase
      .from("job_run_tasks")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: errorMessage,
        error_stage: stage,
      })
      .eq("id", taskId)
  );
  await withRetry(`mark job_run ${jobRunId} failed`, () =>
    supabase
      .from("job_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: errorMessage,
        failed_companies: 1,
      })
      .eq("id", jobRunId)
  );
}

async function main() {
  console.log("🚀 Starting heavy scraper script...");

  // Step 1: Get COMPANY_ID and optional TASK_ID from environment
  const companyId = process.env.COMPANY_ID;
  const taskId = process.env.TASK_ID;
  
  if (!companyId) {
    console.error("❌ Error: COMPANY_ID environment variable is required");
    process.exit(1);
  }
  console.log(`📋 Company ID: ${companyId}`);
  if (taskId) {
    console.log(`📋 Task ID: ${taskId} (will update existing task)`);
  } else {
    console.log(`📋 No TASK_ID provided (will create new task)`);
  }

  // Step 2: Initialize Supabase Admin Client
  console.log("🔌 Initializing Supabase admin client...");
  const supabase = createAdminClient();

  // Validate environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("❌ Error: NEXT_PUBLIC_SUPABASE_URL environment variable is required");
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required");
    process.exit(1);
  }

  // Step 3: Fetch Company record. Ridden out with withTransientRetry so a
  // Supabase origin outage at the very START of the run is survived rather than
  // killing the process at the first read — the same resilience every later DB
  // op in this script already has. The June 18 2026 Supabase outage killed every
  // fresh-runner `scrape-retry` here, at the first read, ~1 min after the
  // primary scrape failed — and the old `companyError?.message || "Company not
  // found"` reported a down DB as "Company not found" (the row plainly exists;
  // it was dispatched by id), which made the logs lie about the real cause. A
  // genuinely missing row (HTTP-OK, zero rows → PGRST116) is a hard config error
  // and is NOT retried; only transient outages (isTransientDbError) are.
  console.log(`🔍 Fetching company record for ID: ${companyId}...`);
  let company: Company;
  try {
    company = await withTransientRetry("fetch company", async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .single();
      if (error) throw error; // transient → retried; PGRST116 (no row) → rethrown
      if (!data) throw new Error(`Company ${companyId} not found`);
      return data as Company;
    });
  } catch (error) {
    console.error(`❌ Error fetching company: ${describeError(error)}`);
    process.exit(1);
  }
  console.log(`✅ Found company: ${company.name} (${company.ats_type})`);

  // Step 4: Launch full puppeteer browser instance
  console.log("🌐 Launching Puppeteer browser...");
  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
      ],
    });
    console.log("✅ Browser launched successfully");
  } catch (error) {
    console.error(`❌ Error launching browser: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Step 5: Get or create task for tracking (required by runIngestStage)
  let task: { id: string; job_run_id: string } | null = null;
  let jobRun: { id: string } | null = null;

  if (taskId) {
    // Update existing task
    console.log(`📝 Updating existing task: ${taskId}...`);
    
    // Fetch existing task. Same outage-hardening as the company read above:
    // the TASK_ID path is the one the fresh-runner retry takes, so these reads
    // are exactly where a still-degraded origin would kill the retry. Ride out
    // transient outages; surface a real failure via describeError instead of a
    // misleading "Task not found".
    try {
      const existingTask = await withTransientRetry("fetch existing task", async () => {
        const { data, error } = await supabase
          .from("job_run_tasks")
          .select("id, job_run_id")
          .eq("id", taskId)
          .single();
        if (error) throw error;
        if (!data) throw new Error(`Task ${taskId} not found`);
        return data;
      });
      task = { id: existingTask.id, job_run_id: existingTask.job_run_id };
    } catch (error) {
      console.error(`❌ Error fetching existing task: ${describeError(error)}`);
      await browser?.close();
      process.exit(1);
    }

    // Fetch the job run to verify it exists
    try {
      jobRun = await withTransientRetry("fetch job run", async () => {
        const { data, error } = await supabase
          .from("job_runs")
          .select("id")
          .eq("id", task!.job_run_id)
          .single();
        if (error) throw error;
        if (!data) throw new Error(`Job run not found for task ${taskId}`);
        return data;
      });
    } catch (error) {
      console.error(`❌ Error fetching job run for task ${taskId}: ${describeError(error)}`);
      await browser?.close();
      process.exit(1);
    }

    // Update task status to running
    const { error: updateError } = await supabase
      .from("job_run_tasks")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        current_stage: "scrape",
        error_message: null,
        error_stage: null,
      })
      .eq("id", taskId);

    if (updateError) {
      console.error(`❌ Error updating task: ${updateError.message}`);
      await browser?.close();
      process.exit(1);
    }

    // Update job run status to running
    await supabase
      .from("job_runs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
      })
      .eq("id", jobRun.id);

    console.log(`✅ Updated existing task: ${task.id}`);
  } else {
    // Create new task (backward compatibility)
    console.log("📝 Creating new job run task...");
    const { data: newJobRun, error: jobRunError } = await supabase
      .from("job_runs")
      .insert({
        job_type: "collect",
        trigger_type: "manual",
        scope: "single",
        company_id: companyId,
        status: "running",
        started_at: new Date().toISOString(),
        total_companies: 1,
      })
      .select("id")
      .single();

    if (jobRunError || !newJobRun) {
      console.error(`❌ Error creating job run: ${jobRunError?.message || "Unknown error"}`);
      await browser?.close();
      process.exit(1);
    }
    jobRun = newJobRun;

    const { data: newTask, error: taskError } = await supabase
      .from("job_run_tasks")
      .insert({
        job_run_id: jobRun.id,
        company_id: companyId,
        status: "running",
        started_at: new Date().toISOString(),
        current_stage: "scrape",
        stage_progress: {},
      })
      .select("id")
      .single();

    if (taskError || !newTask) {
      console.error(`❌ Error creating task: ${taskError?.message || "Unknown error"}`);
      await browser?.close();
      process.exit(1);
    }
    task = { id: newTask.id, job_run_id: jobRun.id };
    console.log(`✅ Created new task: ${task.id}`);
  }

  // SIGTERM/SIGINT handler: GH Actions sends SIGTERM on job cancel /
  // timeout-minutes expiry. Without this the in-script try/catch never
  // runs and the task is stuck in 'running'. Idempotent — if we exit
  // cleanly later, this handler is a no-op.
  const onSignal = (signal: NodeJS.Signals) => {
    console.error(`⚠️  Received ${signal}; marking task failed before exit`);
    const stage = task ? "scrape" : "init";
    if (task && jobRun) {
      void markTaskFailed(supabase, task.id, jobRun.id, `Process received ${signal}`, stage)
        .finally(() => process.exit(1));
    } else {
      process.exit(1);
    }
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);

  try {
    // Step 6: Fetch jobs using browser instance
    console.log(`🔎 Fetching jobs for ${company.name}...`);
    const jobs = await fetchJobs(
      company.ats_type,
      company.ats_identifier || "",
      company.careers_url || undefined,
      browser
    );
    console.log(`✅ Fetched ${jobs.length} jobs`);

    // Step 7: Record scrape completion. Split into two writes that used to be
    // one, because they have very different failure profiles:
    //
    //   (a) progress fields (jobs_fetched + stage_progress.scrape) — a handful
    //       of bytes; must succeed, so retry transient outages.
    //   (b) scraped_data — the FULL enriched corpus as a single JSONB value.
    //       For the big incumbent banks (RBC/Scotia/TD, 1.4-1.9k jobs) that is
    //       a 12-17MB write that deterministically blows Supabase's 8s
    //       statement_timeout (57014) and sometimes trips a gateway 520/521.
    //       The old combined write THREW on that failure, aborting the whole
    //       run AFTER a clean fetch+enrich and stranding the bank with a stale
    //       corpus for days (Scotia & TD, June 2026). The snapshot is only ever
    //       read back by the rare `startFromStage:'ingest'` resume; the ingest
    //       below (Step 8) uses the in-memory `jobs`, so a missing snapshot
    //       must NOT abort the run. Write it best-effort, OUTSIDE the transient
    //       retry (a 57014 here is deterministic for these payloads — retrying
    //       just burns ~63s before the same failure), and continue on error.
    await withTransientRetry("save scrape progress", async () => {
      const { error } = await supabase
        .from("job_run_tasks")
        .update({
          jobs_fetched: jobs.length,
          stage_progress: {
            scrape: {
              status: "completed",
              completedAt: new Date().toISOString(),
              jobs_fetched: jobs.length,
            },
          },
        })
        .eq("id", task.id);
      if (error) throw error;
    });

    try {
      const { error } = await supabase
        .from("job_run_tasks")
        .update({ scraped_data: jobs })
        .eq("id", task.id);
      if (error) throw error;
    } catch (snapshotErr) {
      console.warn(
        `⚠️  Skipping scraped_data snapshot for task ${task.id} (${jobs.length} jobs): ${describeError(
          snapshotErr
        )}. Ingest continues from the in-memory corpus.`
      );
    }

    // Step 8: Call runIngestStage to save results. Wrapped so a Supabase restart
    // mid-ingest (PostgREST schema-cache reload → PGRST002) is ridden out rather
    // than discarding a completed scrape. runIngestStage is idempotent — it
    // upserts by external id — so a full retry from the top is safe.
    console.log("💾 Ingesting jobs into database...");
    const ingestResult = await withTransientRetry("ingest jobs", () =>
      runIngestStage(task.id, company as Company, jobs)
    );
    console.log(`✅ Ingest complete:`);
    console.log(`   - New jobs: ${ingestResult.newJobIds.length}`);
    console.log(`   - Updated jobs: ${ingestResult.updated}`);
    console.log(`   - Closed jobs: ${ingestResult.closed}`);

    // Mark task as completed
    await supabase
      .from("job_run_tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        current_stage: "done",
      })
      .eq("id", task.id);

    // Update job run
    await supabase
      .from("job_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_companies: 1,
        total_new_jobs: ingestResult.newJobIds.length,
        total_updated_jobs: ingestResult.updated,
        total_closed_jobs: ingestResult.closed,
      })
      .eq("id", jobRun.id);

    console.log("✅ Scraping completed successfully!");

    // Step 9: Analysis. The Vercel collect route fires analysis the moment
    // executeCollectionJob returns — far too early for an offloaded scraper
    // whose scrape + ingest only just finished here. Without this call the
    // analysis stage (and the incumbent cost gate inside runAnalyzeStage)
    // never runs for browser-scraped companies. Scoped to this company's
    // newly-ingested jobs so sibling fintech tasks aren't re-analyzed.
    if (ingestResult.newJobIds.length > 0) {
      console.log(
        `🧠 Triggering analysis for ${ingestResult.newJobIds.length} new job(s)...`
      );
      try {
        const analysisRunId = await triggerAnalysisForJobs(
          companyId,
          ingestResult.newJobIds,
          jobRun.id
        );
        console.log(`✅ Analysis stage complete (run ${analysisRunId})`);
      } catch (analysisError) {
        // Collection data is already saved and the task is marked
        // completed — an analysis failure is recoverable (re-runnable), so
        // log loudly but don't fail the whole script.
        console.error(
          `⚠️  Analysis stage failed (collection data is safe): ${
            analysisError instanceof Error
              ? analysisError.message
              : String(analysisError)
          }`
        );
      }
    } else {
      console.log("ℹ️  No new jobs — skipping analysis stage.");
    }
  } catch (error) {
    const errorMessage = describeError(error);
    console.error(`❌ Error during scraping: ${errorMessage}`);

    // Mark task + job_run as failed with retry. If the underlying cause
    // was a transient Supabase outage (May 28 2026 TD incident), the
    // unretried single-shot updates here silently failed against a DB
    // that was mid-recovery and the task stayed in 'running'.
    await markTaskFailed(supabase, task.id, jobRun.id, errorMessage, "scrape");

    throw error;
  } finally {
    // Step 9: Close browser
    if (browser) {
      console.log("🔒 Closing browser...");
      await browser.close();
      console.log("✅ Browser closed");
    }
  }
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
