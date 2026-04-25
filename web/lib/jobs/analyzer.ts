import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeJobAdvanced } from "@/lib/analysis";
import type { Company, AnalyzeResult } from "./types";
import { updateTaskProgress } from "./progress";
import { log } from "@/lib/log";

/**
 * Stage 3: Analyze - Run LLM analysis on pending jobs
 * Updates task: insights_generated, clears pending_analysis_job_ids, stage_progress.analyze
 */
export async function runAnalyzeStage(
  taskId: string,
  company: Company,
  jobIds: string[],
  onProgress?: (analyzed: number, total: number) => void
): Promise<AnalyzeResult> {
  const supabase = createAdminClient();

  // Update stage to running
  await updateTaskProgress(taskId, 'analyze', {
    status: 'running',
    startedAt: new Date().toISOString(),
  });

  try {
    let insightsGenerated = 0;
    const total = jobIds.length;
    let analyzed = 0;

    // Process each job that needs analysis
    for (const jobId of jobIds) {
      // Get job posting details
      const { data: jobPosting } = await supabase
        .from('job_postings')
        .select('id, title, standardized_department, location, description_text')
        .eq('id', jobId)
        .single();

      if (!jobPosting) {
        analyzed++;
        if (onProgress) {
          onProgress(analyzed, total);
        }
        continue;
      }

      // Run analysis
      const insight = await analyzeJobAdvanced({
        companyId: company.id,
        companyName: company.name,
        job: {
          title: jobPosting.title,
          standardized_department: jobPosting.standardized_department,
          location: jobPosting.location,
          description_text: jobPosting.description_text,
        },
      });

      if (insight) {
        // Extract web context for storage
        const webContext = insight.web_corroboration
          ? [{ snippet: insight.web_corroboration }]
          : [];

        await supabase.from('strategic_insights').insert({
          job_posting_id: jobId,
          category: insight.category,
          insight_summary: insight.insight_summary,
          strategic_signals: insight.strategic_signals,
          is_new_direction: insight.is_new_direction,
          confidence: insight.confidence,
          novelty_score: insight.novelty_score,
          novelty_reasoning: insight.novelty_reasoning,
          is_executive_movement: insight.is_executive_movement,
          executive_context: insight.executive_context,
          strategic_hypothesis: insight.strategic_hypothesis,
          web_context: webContext,
          model_reasoning: insight.model_reasoning,
        });

        insightsGenerated++;
      }

      analyzed++;
      if (onProgress) {
        onProgress(analyzed, total);
      }
    }

    // Update task with results
    await supabase
      .from('job_run_tasks')
      .update({
        insights_generated: insightsGenerated,
        pending_analysis_job_ids: [],
        stage_progress: {
          analyze: {
            status: 'completed',
            completedAt: new Date().toISOString(),
            analyzed: total,
            total: total,
          },
        },
      })
      .eq('id', taskId);

    return {
      insightsGenerated,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Update stage to failed
    await supabase
      .from('job_run_tasks')
      .update({
        status: 'failed',
        error_message: errorMessage,
        error_stage: 'analyze',
        stage_progress: {
          analyze: {
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
 * Run analysis for a task
 */
export async function processAnalysisTask(taskId: string): Promise<void> {
  const supabase = createAdminClient();

  // Get task
  const { data: task } = await supabase
    .from('job_run_tasks')
    .select('company_id, pending_analysis_job_ids')
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
      current_stage: 'analyze',
    })
    .eq('id', taskId);

  try {
    // Get pending job IDs
    const jobIds = task.pending_analysis_job_ids || [];

    if (jobIds.length === 0) {
      // No jobs to analyze, mark as completed
      await supabase
        .from('job_run_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          current_stage: 'done',
        })
        .eq('id', taskId);
      return;
    }

    // Run analysis stage
    await runAnalyzeStage(taskId, company, jobIds, (analyzed, total) => {
      // Update progress
      updateTaskProgress(taskId, 'analyze', {
        analyzed,
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
    // Task failure is already handled in stage function
    throw error;
  }
}
