"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow, format } from "date-fns";

interface CronLog {
  id: string;
  job_type: "collect" | "report";
  started_at: string;
  completed_at: string | null;
  status: "running" | "success" | "error";
  new_jobs_count: number;
  closed_jobs_count: number;
  insights_generated: number;
  companies_processed: number;
  error_message: string | null;
}

export function CronLogsTable() {
  const [logs, setLogs] = useState<CronLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "collect" | "report">("all");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (filter !== "all") params.set("job_type", filter);
      const res = await fetch(`/api/admin/cron-logs?${params}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
    } catch (e) {
      console.error("Failed to fetch logs:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filter]);

  const triggerJob = async (jobType: "collect" | "report") => {
    setTriggering(jobType);
    try {
      const res = await fetch("/api/admin/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_type: jobType }),
      });
      if (res.ok) {
        // Refresh logs after a short delay
        setTimeout(fetchLogs, 2000);
      }
    } catch (e) {
      console.error("Failed to trigger job:", e);
    } finally {
      setTriggering(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Success
          </span>
        );
      case "running":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Running
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600">
            Collection
          </span>
        );
      case "report":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-600">
            Report
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <h3 className="font-semibold">Job Execution History</h3>
          <CardDescription>Recent cron job runs and their results</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => triggerJob("collect")}
            disabled={triggering !== null}
          >
            {triggering === "collect" ? (
              <>
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Running...
              </>
            ) : (
              "Run Collection"
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => triggerJob("report")}
            disabled={triggering !== null}
          >
            {triggering === "report" ? (
              <>
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Running...
              </>
            ) : (
              "Send Report"
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-4 border-b">
          {(["all", "collect", "report"] as const).map((f) => (
            <button
              key={f}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                filter === f
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All Jobs" : f === "collect" ? "Collections" : "Reports"}
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
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      {getJobTypeBadge(log.job_type)}
                      {getStatusBadge(log.status)}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {format(new Date(log.started_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                    {log.status === "success" && log.job_type === "collect" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        +{log.new_jobs_count} new jobs, {log.closed_jobs_count} closed, {log.insights_generated} insights
                      </p>
                    )}
                    {log.error_message && (
                      <p className="text-xs text-red-600 mt-1">{log.error_message}</p>
                    )}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(log.started_at), { addSuffix: true })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
