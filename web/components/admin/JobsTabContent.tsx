"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { CronLogsTable } from "@/components/admin/CronLogsTable";
import { JobTriggerButtons } from "@/components/admin/JobTriggerButtons";
import { formatDistanceToNow } from "date-fns";

interface Schedule {
  path: string;
  schedule: string;
  name: string;
  readable: string;
}

interface LastRun {
  completed_at: string;
  total_new_jobs?: number;
}

interface JobsTabContentProps {
  collectionSchedule?: Schedule;
  reportSchedule?: Schedule;
  lastCollect?: LastRun | null;
  lastReport?: LastRun | null;
}

export function JobsTabContent({
  collectionSchedule,
  reportSchedule,
  lastCollect,
  lastReport,
}: JobsTabContentProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleTriggered = useCallback(() => {
    // Trigger a refresh by updating the key
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <div className="space-y-4">
      {/* Schedule Info Card */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold">Job Schedules</h3>
          <CardDescription>
            Jobs are scheduled using Vercel Cron. Schedules are defined in vercel.json 
            and can be changed in the Vercel dashboard or by editing the configuration file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Current Schedules */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Current Schedules:</p>
              <div className="space-y-2">
                {collectionSchedule && (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-sm">Collection: {collectionSchedule.readable}</span>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">{collectionSchedule.schedule}</code>
                  </div>
                )}
                {reportSchedule && (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                    <span className="text-sm">Reports: {reportSchedule.readable}</span>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">{reportSchedule.schedule}</code>
                  </div>
                )}
              </div>
            </div>

            {/* Last Run Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium">Last Job Collection</p>
                  {lastCollect ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(lastCollect.completed_at), { addSuffix: true })}
                      </p>
                      <p className="text-xs text-green-600">
                        +{lastCollect.total_new_jobs ?? 0} new jobs found
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No runs recorded</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium">Last Weekly Report</p>
                  {lastReport ? (
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(lastReport.completed_at), { addSuffix: true })}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">No reports sent yet</p>
                  )}
                </div>
              </div>
            </div>

            {/* Manual Trigger Buttons */}
            <div className="pt-2 border-t">
              <JobTriggerButtons onTriggered={handleTriggered} />
            </div>

            {/* Instructions */}
            <div className="text-xs text-muted-foreground pt-2 border-t">
              <p>To change schedules, edit <code className="bg-muted px-1 py-0.5 rounded">web/vercel.json</code> or update cron settings in the Vercel dashboard.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Execution History Table */}
      <CronLogsTable key={refreshKey} />
    </div>
  );
}
