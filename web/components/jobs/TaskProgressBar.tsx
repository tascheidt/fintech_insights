"use client";

import * as React from "react";
import { Progress } from "@/components/ui/progress";
import type { TaskProgress, TaskStage } from "@/lib/jobs/types";
import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskProgressBarProps {
  progress: TaskProgress;
  currentStage?: TaskStage | null;
  className?: string;
}

export function TaskProgressBar({ progress, currentStage, className }: TaskProgressBarProps) {
  const stages: Array<{ key: TaskStage; label: string }> = [
    { key: 'scrape', label: 'Scrape' },
    { key: 'ingest', label: 'Ingest' },
    { key: 'analyze', label: 'Analyze' },
  ];

  const getStageStatus = (stage: TaskStage) => {
    const stageProgress = progress[stage];
    if (!stageProgress) return 'pending';
    return stageProgress.status;
  };

  const getStageProgress = (stage: TaskStage) => {
    const stageProgress = progress[stage];
    if (!stageProgress) return 0;
    
    if (stageProgress.status === 'completed') return 100;
    if (stageProgress.status === 'failed') return 0;
    if (stageProgress.status === 'running') {
      if (stage === 'ingest' && 'processed' in stageProgress && 'total' in stageProgress) {
        const processed = stageProgress.processed || 0;
        const total = stageProgress.total || 1;
        return Math.round((processed / total) * 100);
      }
      if (stage === 'analyze' && 'analyzed' in stageProgress && 'total' in stageProgress) {
        const analyzed = stageProgress.analyzed || 0;
        const total = stageProgress.total || 1;
        return Math.round((analyzed / total) * 100);
      }
      return 50; // Default running progress
    }
    return 0;
  };

  const getStageDetail = (stage: TaskStage) => {
    const stageProgress = progress[stage];
    if (!stageProgress || stageProgress.status !== 'running') return null;

    if (stage === 'ingest' && 'processed' in stageProgress && 'total' in stageProgress) {
      return `Processing job ${stageProgress.processed || 0} of ${stageProgress.total || 0}`;
    }
    if (stage === 'analyze' && 'analyzed' in stageProgress && 'total' in stageProgress) {
      return `Analyzing ${stageProgress.analyzed || 0} of ${stageProgress.total || 0}`;
    }
    return null;
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        {stages.map((stage, index) => {
          const status = getStageStatus(stage.key);
          const isActive = currentStage === stage.key;
          const isCompleted = status === 'completed';
          const isFailed = status === 'failed';
          const isRunning = status === 'running';

          return (
            <React.Fragment key={stage.key}>
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className="flex items-center gap-2 w-full">
                  <div
                    className={cn(
                      "flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium",
                      isCompleted && "bg-green-500 text-white",
                      isFailed && "bg-red-500 text-white",
                      isRunning && "bg-blue-500 text-white animate-pulse",
                      !isCompleted && !isFailed && !isRunning && "bg-gray-300 text-gray-600"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-medium">{stage.label}</div>
                    {isActive && getStageDetail(stage.key) && (
                      <div className="text-xs text-muted-foreground">
                        {getStageDetail(stage.key)}
                      </div>
                    )}
                  </div>
                </div>
                {isActive && (
                  <Progress
                    value={getStageProgress(stage.key)}
                    className="w-full h-1"
                  />
                )}
              </div>
              {index < stages.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1",
                    isCompleted ? "bg-green-500" : "bg-gray-300"
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
