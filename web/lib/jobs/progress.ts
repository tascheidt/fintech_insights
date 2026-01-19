import { createAdminClient } from "@/lib/supabase/admin";
import type { TaskStage, StageProgress } from "./types";

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
  const { data: task } = await supabase
    .from('job_run_tasks')
    .select('stage_progress, current_stage')
    .eq('id', taskId)
    .single();

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
    console.error('Error updating job run stats:', error);
    throw error;
  }
}
