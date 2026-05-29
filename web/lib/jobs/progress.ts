import { createAdminClient } from "@/lib/supabase/admin";
import type { TaskStage, StageProgress } from "./types";
import { log } from "@/lib/log";

/**
 * Stringify a Supabase/PostgREST error for log + thrown-Error use.
 *
 * `PostgrestError` is `{ message, code, details, hint }` but transient
 * transport failures (DB restart, lost connection) bubble up as objects
 * whose `.message` and `.code` are both `undefined` — see the May 28 2026
 * TD heavy-scrape: a Supabase Postgres recovery during the ingest stage
 * surfaced as the literally-useless string `"undefined (code=n/a)"`. We
 * now always include a JSON dump of every own-enumerable property, plus
 * any non-enumerable `name` and `cause` (FetchError / DOMException carry
 * the real reason there), so the GH Actions log captures the real shape.
 */
function formatPostgrestError(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const e = err as {
    message?: unknown;
    code?: unknown;
    details?: unknown;
    hint?: unknown;
    name?: unknown;
    cause?: unknown;
  };
  const parts: string[] = [];
  if (typeof e.message === 'string' && e.message) parts.push(`message=${e.message}`);
  if (e.code !== undefined && e.code !== null) parts.push(`code=${String(e.code)}`);
  if (e.details !== undefined && e.details !== null) parts.push(`details=${String(e.details)}`);
  if (e.hint !== undefined && e.hint !== null) parts.push(`hint=${String(e.hint)}`);
  if (typeof e.name === 'string' && e.name && e.name !== 'Error') parts.push(`name=${e.name}`);
  if (e.cause) {
    const c = e.cause as { message?: string; code?: string };
    const causeMsg = c.message ?? String(c);
    if (c.code) parts.push(`cause=${c.code}:${causeMsg}`);
    else parts.push(`cause=${causeMsg}`);
  }
  if (parts.length === 0) {
    // Every advertised field was empty — give the raw JSON so we at
    // least see the shape Supabase handed us.
    try {
      return `raw=${JSON.stringify(err)}`;
    } catch {
      return `raw=<unserializable>`;
    }
  }
  return parts.join(' ');
}

/**
 * Update task stage progress (writes to DB, triggers Realtime)
 */
export async function updateTaskProgress(
  taskId: string,
  stage: TaskStage,
  progress: Partial<StageProgress>
): Promise<void> {
  const supabase = createAdminClient();

  // Get current task to merge progress
  const { data: task, error: fetchError } = await supabase
    .from('job_run_tasks')
    .select('stage_progress, current_stage')
    .eq('id', taskId)
    .maybeSingle();

  if (fetchError) {
    // Without the underlying message, a PostgREST/RLS/transport failure
    // surfaces as a generic "Task not found" downstream and the real cause
    // is lost. See May 2026 TD ingest incident.
    throw new Error(
      `Task ${taskId} lookup failed: ${formatPostgrestError(fetchError)}`
    );
  }
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  const currentProgress = (task.stage_progress as Record<string, Partial<StageProgress>>) || {};
  const stageProgress = currentProgress[stage] || {};

  // Merge progress
  const updatedProgress = {
    ...currentProgress,
    [stage]: {
      ...stageProgress,
      ...progress,
    },
  };

  // Update task
  await supabase
    .from('job_run_tasks')
    .update({
      stage_progress: updatedProgress,
      current_stage: stage !== 'done' ? stage : task.current_stage,
    })
    .eq('id', taskId);
}

/**
 * Recompute job run aggregate stats from tasks
 */
export async function updateJobRunStats(jobRunId: string): Promise<void> {
  const supabase = createAdminClient();

  // Call the database function
  const { error } = await supabase.rpc('update_job_run_stats', {
    job_run_uuid: jobRunId,
  });

  if (error) {
    log.error({ err: error }, 'Error updating job run stats:');
    throw error;
  }
}
