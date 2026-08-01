import type { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Days to keep a task's `scraped_data` snapshot before nulling it.
 *
 * The snapshot (the full enriched ATS corpus, 12-17MB for the big banks) is
 * only ever read back by a `startFromStage:'ingest'` resume, and a run is only
 * resumable inside the 25-minute STALE_JOB_THRESHOLD_MS window. 2 days is a
 * generous safety buffer past that; after it the snapshot is pure dead weight.
 * Letting these accumulate is what put the DB at 224% of the free-tier quota
 * (June 2026 — `job_run_tasks` alone was 673MB).
 */
const SNAPSHOT_RETENTION_DAYS = 2;

/** Days to keep `job_runs` rows (and, via ON DELETE CASCADE, their tasks). */
const RUN_RETENTION_DAYS = 90;

/**
 * Days to keep `gemini_usage_events` telemetry rows. Every Gemini call appends
 * one row and nothing ever deletes them, so the table grows unbounded (~36k
 * rows / 15MB by July 2026). The cost-alarm cron only ever reads the last 24h,
 * and dashboards read recent windows, so anything past 90 days is pure storage.
 */
const USAGE_EVENT_RETENTION_DAYS = 90;

export interface RetentionResult {
  snapshotsNulled: number;
  runsDeleted: number;
  usageEventsDeleted: number;
  sharedReportsDeleted: number;
}

const daysAgoIso = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

/**
 * Bounds `job_run_tasks` / `job_runs` storage. Best-effort: each step is
 * independently guarded so a failure (or the rare self-FK clash on the run
 * delete) is logged and swallowed, never aborting the caller (the collect cron).
 *
 * 1. Null `scraped_data` on tasks older than SNAPSHOT_RETENTION_DAYS — the
 *    load-bearing step; this is where the bytes live.
 * 2. Delete `job_runs` older than RUN_RETENTION_DAYS — cascades to
 *    `job_run_tasks`; `gemini_usage_events.job_run_id` is SET NULL (telemetry
 *    rows are preserved, just unlinked).
 * 3. Delete `gemini_usage_events` older than USAGE_EVENT_RETENTION_DAYS — bounds
 *    the otherwise-unbounded telemetry table.
 * 4. Delete `shared_search_reports` past their `expires_at` — each carries a
 *    denormalized `jobs_snapshot`, so an unbounded table of them is the same
 *    storage shape that put us over quota in June 2026. Expiry also means a
 *    share link a user has lost track of stops resolving.
 */
export async function pruneJobRunRetention(
  supabase: AdminClient
): Promise<RetentionResult> {
  let snapshotsNulled = 0;
  let runsDeleted = 0;
  let usageEventsDeleted = 0;
  let sharedReportsDeleted = 0;

  try {
    const { data, error } = await supabase
      .from("job_run_tasks")
      .update({ scraped_data: null })
      .lt("started_at", daysAgoIso(SNAPSHOT_RETENTION_DAYS))
      .not("scraped_data", "is", null)
      .select("id");
    if (error) throw error;
    snapshotsNulled = data?.length ?? 0;
  } catch (err) {
    log.error({ err }, "Retention: failed to null stale scraped_data");
  }

  try {
    const { data, error } = await supabase
      .from("job_runs")
      .delete()
      .lt("started_at", daysAgoIso(RUN_RETENTION_DAYS))
      .select("id");
    if (error) throw error;
    runsDeleted = data?.length ?? 0;
  } catch (err) {
    log.error({ err }, "Retention: failed to delete old job_runs");
  }

  try {
    const { data, error } = await supabase
      .from("gemini_usage_events")
      .delete()
      .lt("created_at", daysAgoIso(USAGE_EVENT_RETENTION_DAYS))
      .select("id");
    if (error) throw error;
    usageEventsDeleted = data?.length ?? 0;
  } catch (err) {
    log.error({ err }, "Retention: failed to delete old gemini_usage_events");
  }

  try {
    const { data, error } = await supabase
      .from("shared_search_reports")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .select("id");
    if (error) throw error;
    sharedReportsDeleted = data?.length ?? 0;
  } catch (err) {
    log.error({ err }, "Retention: failed to delete expired shared reports");
  }

  return { snapshotsNulled, runsDeleted, usageEventsDeleted, sharedReportsDeleted };
}
