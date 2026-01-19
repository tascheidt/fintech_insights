"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TaskProgressBar } from "@/components/jobs/TaskProgressBar";
import type { JobRunTask, TaskStage } from "@/lib/jobs/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface ProcessButtonProps {
  companyId: string;
  companyName: string;
}

const CLIENT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export function ProcessButton({ companyId, companyName }: ProcessButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [jobRunId, setJobRunId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<JobRunTask | null>(null);
  const [result, setResult] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);
  const [timeoutWarning, setTimeoutWarning] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Cleanup subscription and timeout on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(console.error);
    }
  }, []);

  // Subscribe to task updates via Supabase Realtime
  useEffect(() => {
    if (!taskId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`task:${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "job_run_tasks",
          filter: `id=eq.${taskId}`,
        },
        (payload) => {
          const updatedTask = payload.new as JobRunTask;
          setTaskStatus(updatedTask);

          // Check if task is completed or failed
          if (updatedTask.status === "completed" || updatedTask.status === "failed") {
            setIsProcessing(false);
            setTimeoutWarning(false);
            
            // Clear timeout
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            startTimeRef.current = null;
            
            if (updatedTask.status === "completed") {
              const message = `Completed: ${updatedTask.new_jobs} new, ${updatedTask.updated_jobs} updated, ${updatedTask.closed_jobs} closed${updatedTask.insights_generated > 0 ? `, ${updatedTask.insights_generated} insights` : ""}`;
              setResult({
                success: true,
                message,
              });

              // Show browser notification
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification(`${companyName} Processing Complete`, {
                  body: message,
                  icon: "/favicon.ico",
                });
              }

              // Refresh page after delay
              setTimeout(() => {
                window.location.reload();
              }, 3000);
            } else {
              const errorMessage = updatedTask.error_message || "Processing failed";
              setResult({
                success: false,
                message: errorMessage,
              });

              // Show browser notification for failure
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification(`${companyName} Processing Failed`, {
                  body: errorMessage,
                  icon: "/favicon.ico",
                });
              }
            }
            // Unsubscribe
            if (channelRef.current) {
              channelRef.current.unsubscribe();
              channelRef.current = null;
            }
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [taskId, companyName]);

  // Set up client-side timeout
  useEffect(() => {
    if (isProcessing && startTimeRef.current) {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set timeout to show warning after 10 minutes
      timeoutRef.current = setTimeout(() => {
        const elapsed = Date.now() - startTimeRef.current!;
        if (elapsed >= CLIENT_TIMEOUT_MS) {
          setTimeoutWarning(true);
        }
      }, CLIENT_TIMEOUT_MS);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isProcessing]);

  function handleCancel() {
    setIsProcessing(false);
    setTimeoutWarning(false);
    setResult({
      success: false,
      message: "Stopped waiting for job (job may still be running)",
    });
    
    // Clear timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    startTimeRef.current = null;
    
    // Unsubscribe from realtime updates
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
  }

  async function handleProcess() {
    if (isProcessing) return;

    setIsProcessing(true);
    setResult(null);
    setTaskStatus(null);
    setTimeoutWarning(false);
    startTimeRef.current = Date.now();

    try {
      const response = await fetch(`/api/companies/${companyId}/process`, {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok && data.jobRunId) {
        setJobRunId(data.jobRunId);

        // Handle "already running" case
        if (data.status === "already_running") {
          setResult({
            success: true,
            message: data.message || "Job already running",
          });
        }

        // Get the task ID for this company (with retry since task creation is async)
        const supabase = createClient();
        let attempts = 0;
        const maxAttempts = 5;
        
        const findTask = async () => {
          const { data: tasks } = await supabase
            .from("job_run_tasks")
            .select("id")
            .eq("job_run_id", data.jobRunId)
            .eq("company_id", companyId)
            .order("started_at", { ascending: false })
            .limit(1);

          if (tasks && tasks.length > 0) {
            setTaskId(tasks[0].id);
          } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(findTask, 500);
          } else {
            // Couldn't find task after retries
            setResult({
              success: false,
              message: "Could not find task. Job may still be running.",
            });
            setIsProcessing(false);
          }
        };

        findTask();
      } else {
        setResult({
          success: false,
          message: data.error || "Failed to start processing",
        });
        setIsProcessing(false);
        startTimeRef.current = null;
      }
    } catch (error) {
      setResult({
        success: false,
        message: "Network error",
      });
      setIsProcessing(false);
      startTimeRef.current = null;
    }
  }

  const progress = taskStatus?.stage_progress as any || {};
  const currentStage = taskStatus?.current_stage;

  return (
    <div className="inline-flex flex-col gap-2">
      <div className="inline-flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleProcess}
          disabled={isProcessing}
          className="h-auto py-1 px-2 text-sm"
          title={`Process jobs for ${companyName}`}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Processing...
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3 mr-1" />
              Process
            </>
          )}
        </Button>
        {isProcessing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="h-auto py-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Stop waiting (job may still be running)"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        {result && (
          <span
            className={`text-xs ${result.success ? "text-green-600" : "text-red-600"}`}
          >
            {result.message}
          </span>
        )}
      </div>
      {timeoutWarning && (
        <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
          ⚠️ Job has been running for over 10 minutes. It may have timed out. Check the job status badge.
        </div>
      )}
      {isProcessing && taskStatus && (
        <div className="w-64">
          <TaskProgressBar
            progress={progress}
            currentStage={currentStage}
          />
        </div>
      )}
    </div>
  );
}
