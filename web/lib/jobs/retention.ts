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

export interface RetentionResult {
  snapshotsNulled: number;
  runsDeleted: number;
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
 */
export async function pruneJobRunRetention(
  supabase: AdminClient
): Promise<RetentionResult> {
  let snapshotsNulled = 0;
  let runsDeleted = 0;

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

  return { snapshotsNulled, runsDeleted };
}
