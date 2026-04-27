"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TaskProgressBar } from "./TaskProgressBar";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import type { JobRun, JobRunTask } from "@/lib/jobs/types";

interface ProcessingJobModalProps {
  jobRunId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProcessingJobModal({
  jobRunId,
  open,
  onOpenChange,
}: ProcessingJobModalProps) {
  const [jobRun, setJobRun] = useState<JobRun | null>(null);
  const [tasks, setTasks] = useState<JobRunTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !jobRunId) return;

    const supabase = createClient();

    const fetchJobRun = async () => {
      const { data, error } = await supabase
        .from("job_runs")
        .select(`
          *,
          tasks:job_run_tasks(*)
        `)
        .eq("id", jobRunId)
        .single();

      if (data && !error) {
        setJobRun(data as JobRun);
        setTasks((data.tasks as JobRunTask[]) || []);
      }
      setLoading(false);
    };

    fetchJobRun();

    // Subscribe to updates
    const channel = supabase
      .channel(`job-run:${jobRunId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_runs",
          filter: `id=eq.${jobRunId}`,
        },
        () => {
          fetchJobRun();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_run_tasks",
          filter: `job_run_id=eq.${jobRunId}`,
        },
        () => {
          fetchJobRun();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [open, jobRunId]);

  const handleRetry = async (taskId: string) => {
    const response = await fetch(`/api/jobs/${jobRunId}/tasks/${taskId}/retry`, {
      method: "POST",
    });
    if (response.ok) {
      // Refresh will happen via subscription
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Job Processing</DialogTitle>
            <DialogDescription>Loading...</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  if (!jobRun) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Job Not Found</DialogTitle>
            <DialogDescription>The requested job could not be found.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Job Processing - {jobRun.job_type === "collect" ? "Collection" : "Analysis"}
          </DialogTitle>
          <DialogDescription>
            Status: {jobRun.status} | Started: {new Date(jobRun.started_at).toLocaleString()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Overall Stats */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
            <div>
              <div className="text-sm text-muted-foreground">Companies</div>
              <div className="text-lg font-semibold">
                {jobRun.completed_companies} / {jobRun.total_companies}
              </div>
            </div>
            {jobRun.job_type === "collect" && (
              <>
                <div>
                  <div className="text-sm text-muted-foreground">New Jobs</div>
                  <div className="text-lg font-semibold">{jobRun.total_new_jobs}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Updated Jobs</div>
                  <div className="text-lg font-semibold">{jobRun.total_updated_jobs}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Closed Jobs</div>
                  <div className="text-lg font-semibold">{jobRun.total_closed_jobs}</div>
                </div>
              </>
            )}
            {jobRun.job_type === "analyze" && (
              <div>
                <div className="text-sm text-muted-foreground">Insights Generated</div>
                <div className="text-lg font-semibold">{jobRun.total_insights}</div>
              </div>
            )}
          </div>

          {/* Tasks */}
          <div className="space-y-3">
            <h3 className="font-semibold">Tasks</h3>
            {tasks.map((task) => (
              <div key={task.id} className="p-4 border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Company Task</div>
                    <div className="text-sm text-muted-foreground">
                      Status: {task.status} | Stage: {task.current_stage || "N/A"}
                    </div>
                  </div>
                  {task.status === "failed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRetry(task.id)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Retry
                    </Button>
                  )}
                </div>
                <TaskProgressBar
                  progress={(task.stage_progress as Record<string, unknown> | null) ?? {}}
                  currentStage={task.current_stage}
                />
                {task.error_message && (
                  <div className="text-sm text-destructive mt-2">
                    Error: {task.error_message}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
