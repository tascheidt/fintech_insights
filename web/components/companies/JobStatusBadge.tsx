"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobRunTask } from "@/lib/jobs/types";

interface JobStatusBadgeProps {
  companyId: string;
  className?: string;
}

export function JobStatusBadge({ companyId, className }: JobStatusBadgeProps) {
  const [task, setTask] = useState<JobRunTask | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Get the most recent task for this company
    const fetchTask = async () => {
      const { data } = await supabase
        .from("job_run_tasks")
        .select("*")
        .eq("company_id", companyId)
        .order("started_at", { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setTask(data as JobRunTask);
      }
      setLoading(false);
    };

    fetchTask();

    // Subscribe to updates
    const channel = supabase
      .channel(`company-tasks:${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_run_tasks",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          fetchTask();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [companyId]);

  if (loading || !task) {
    return null;
  }

  // Only show badge for running or recently completed/failed tasks (within last hour)
  const isRecent = task.completed_at
    ? new Date(task.completed_at).getTime() > Date.now() - 3600000
    : false;

  if (task.status !== "running" && !isRecent) {
    return null;
  }

  const getStatusConfig = () => {
    switch (task.status) {
      case "running":
        return {
          icon: Loader2,
          label: "Processing",
          className: "text-blue-600 bg-blue-50",
          iconClassName: "animate-spin",
        };
      case "completed":
        return {
          icon: CheckCircle2,
          label: "Completed",
          className: "text-green-600 bg-green-50",
          iconClassName: "",
        };
      case "failed":
        return {
          icon: XCircle,
          label: "Failed",
          className: "text-red-600 bg-red-50",
          iconClassName: "",
        };
      default:
        return {
          icon: Clock,
          label: "Pending",
          className: "text-gray-600 bg-gray-50",
          iconClassName: "",
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        config.className,
        className
      )}
    >
      <Icon className={cn("h-3 w-3", config.iconClassName)} />
      <span>{config.label}</span>
      {task.status === "completed" && (
        <span className="ml-1">
          ({task.new_jobs} new, {task.updated_jobs} updated)
        </span>
      )}
    </div>
  );
}
