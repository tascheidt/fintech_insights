"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { formatDistanceToNow, format } from "date-fns";

interface CronLog {
  id: string;
  job_type: "collect" | "report" | "analyze" | "company-insights" | "insight-generation";
  trigger_type: "cron" | "manual" | "admin";
  operation: string | null;
  started_at: string;
  completed_at: string | null;
  status: "queued" | "running" | "success" | "error";
  new_jobs_count: number;
  closed_jobs_count: number;
  insights_generated: number;
  companies_processed: number;
  error_message: string | null;
  details?: Record<string, unknown>;
}

interface CronLogsTableProps {
  /** Bumped externally to signal a refresh is needed */
  refreshSignal?: number;
}

export function CronLogsTable({ refreshSignal }: CronLogsTableProps) {
  const [logs, setLogs] = useState<CronLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "collect" | "analyze" | "company-insights" | "report">("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchLogs = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (filter !== "all") params.set("job_type", filter);
      const res = await fetch(`/api/admin/job-runs?${params}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
    } catch (e) {
      console.error("Failed to fetch logs:", e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Fetch on mount and filter change
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Re-fetch when a job is triggered (with a short delay for the DB row to appear)
  useEffect(() => {
    if (!refreshSignal) return;
    const t1 = setTimeout(() => fetchLogs(false), 1500);
    const t2 = setTimeout(() => fetchLogs(false), 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [refreshSignal, fetchLogs]);

  // Poll every 10s while any job is running
  useEffect(() => {
    const hasRunning = logs.some((l) => l.status === "running" || l.status === "queued");
    if (!hasRunning) return;
    const interval = setInterval(() => fetchLogs(false), 10000);
    return () => clearInterval(interval);
  }, [logs, fetchLogs]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-growth-500/10 text-growth-500">
            <span className="w-1.5 h-1.5 rounded-full bg-growth-500" />
            Success
          </span>
        );
      case "running":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-soft text-primary-soft-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Running
          </span>
        );
      case "queued":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent-soft text-accent-soft-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            Queued
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
            Error
          </span>
        );
      default:
        return null;
    }
  };

  const getJobTypeBadge = (type: string) => {
    switch (type) {
      case "collect":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-soft text-primary-soft-foreground">
            Collection
          </span>
        );
      case "report":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cat-data/10 text-cat-data">
            Report
          </span>
        );
      case "analyze":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-highlight-soft text-highlight-soft-foreground">
            Analyze
          </span>
        );
      case "company-insights":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-growth-500/10 text-growth-500">
            Strategic Insights
          </span>
        );
      case "insight-generation":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cat-operations/10 text-cat-operations">
            Insight
          </span>
        );
      default:
        return null;
    }
  };

  const getJobLabel = (log: CronLog) => {
    if (log.operation === "job-structure-reprocess") return "Prompt Forge Reprocess";
    if (log.job_type === "company-insights" && log.trigger_type === "admin") return "Strategic Insights Refresh";
    return null;
  };

  const getSummary = (log: CronLog) => {
    const details = log.details ?? {};

    if (log.operation === "job-structure-reprocess") {
      const totalJobs = typeof details.totalJobs === "number" ? details.totalJobs : 0;
      const processedJobs = typeof details.processedJobs === "number" ? details.processedJobs : 0;
      const failedJobs = typeof details.failedJobs === "number" ? details.failedJobs : 0;
      const techStacks =
        typeof details.techStacks === "object" && details.techStacks !== null
          ? (details.techStacks as Record<string, unknown>)
          : null;
      const refreshedStacks = techStacks && typeof techStacks.refreshed === "number" ? techStacks.refreshed : null;

      return `${processedJobs}/${totalJobs} jobs processed${failedJobs ? `, ${failedJobs} failed` : ""}${refreshedStacks !== null ? `, ${refreshedStacks} tech stacks refreshed` : ""}`;
    }

    if (log.job_type === "collect") {
      return `+${log.new_jobs_count} new jobs, ${log.closed_jobs_count} closed, ${log.insights_generated} insights`;
    }

    if (log.job_type === "company-insights") {
      const refreshed = typeof details.refreshed === "number" ? details.refreshed : log.insights_generated;
      const failed = typeof details.failed === "number" ? details.failed : 0;
      return `${refreshed} companies refreshed${failed ? `, ${failed} failed` : ""}`;
    }

    return null;
  };

  const deleteJob = useCallback(async (jobRunId: string) => {
    const confirmed = window.confirm("Delete this job run from history?");
    if (!confirmed) return;

    setDeletingId(jobRunId);
    try {
      const res = await fetch("/api/admin/job-runs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobRunId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete job");
      }

      setLogs((current) => current.filter((log) => log.id !== jobRunId));
    } catch (error) {
      console.error("Failed to delete job:", error);
    } finally {
      setDeletingId(null);
      fetchLogs(false);
    }
  }, [fetchLogs]);

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold">Job Execution History</h3>
        <CardDescription>Recent job runs and their results</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-4 border-b overflow-x-auto">
          {(["all", "collect", "analyze", "company-insights", "report"] as const).map((f) => (
            <button
              key={f}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                filter === f
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setFilter(f)}
            >
              {f === "all"
                ? "All Jobs"
                : f === "collect"
                  ? "Collections"
                  : f === "analyze"
                    ? "Analyze"
                    : f === "company-insights"
                      ? "Insights"
                      : "Reports"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No job executions recorded yet
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {log.job_type === "collect" ? (
                      <div className="w-8 h-8 rounded-lg bg-primary-soft flex items-center justify-center">
                        <svg className="w-4 h-4 text-primary-soft-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </div>
                    ) : log.job_type === "report" ? (
                      <div className="w-8 h-8 rounded-lg bg-cat-data/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-cat-data" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                    ) : log.job_type === "company-insights" ? (
                      <div className="w-8 h-8 rounded-lg bg-growth-500/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-growth-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-highlight-soft flex items-center justify-center">
                        <svg className="w-4 h-4 text-highlight-soft-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      {getJobTypeBadge(log.job_type)}
                      {getStatusBadge(log.status)}
                    </div>
                    {getJobLabel(log) && (
                      <p className="text-sm font-medium mt-1">{getJobLabel(log)}</p>
                    )}
                    <p className="text-sm text-muted-foreground mt-1">
                      {format(new Date(log.started_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                    {getSummary(log) && (
                      <p className="text-xs text-muted-foreground mt-1">{getSummary(log)}</p>
                    )}
                    {log.error_message && (
                      <p className="text-xs text-destructive mt-1">{log.error_message}</p>
                    )}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground space-y-2">
                  <div>{formatDistanceToNow(new Date(log.started_at), { addSuffix: true })}</div>
                  <button
                    type="button"
                    className="text-destructive hover:opacity-80 disabled:opacity-50"
                    disabled={deletingId === log.id}
                    onClick={() => deleteJob(log.id)}
                  >
                    {deletingId === log.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
