"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Check } from "lucide-react";

type ButtonState = "idle" | "submitting" | "accepted";

interface JobTriggerButtonsProps {
  onTriggered?: () => void;
}

export function JobTriggerButtons({ onTriggered }: JobTriggerButtonsProps) {
  const [collectState, setCollectState] = useState<ButtonState>("idle");
  const [reportState, setReportState] = useState<ButtonState>("idle");
  const [techStackState, setTechStackState] = useState<ButtonState>("idle");
  const [insightRefreshState, setInsightRefreshState] = useState<ButtonState>("idle");
  const [error, setError] = useState<string | null>(null);

  const triggerJob = useCallback(async (
    jobType: "collect" | "report" | "tech-stack-backfill" | "company-insights-refresh",
    setState: (s: ButtonState) => void,
  ) => {
    setState("submitting");
    setError(null);

    try {
      const res = await fetch("/api/admin/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_type: jobType }),
      });

      if (!res.ok && res.status !== 202) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }

      setState("accepted");
      onTriggered?.();

      // Reset to idle after 3 seconds
      setTimeout(() => setState("idle"), 3000);
    } catch (e) {
      setState("idle");
      setError(e instanceof Error ? e.message : "Failed to trigger job");
    }
  }, [onTriggered]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={collectState !== "idle"}
          onClick={() => triggerJob("collect", setCollectState)}
        >
          {collectState === "submitting" && <Loader2 className="w-3 h-3 animate-spin mr-1.5" />}
          {collectState === "accepted" && <Check className="w-3 h-3 mr-1.5" />}
          {collectState === "idle" ? "Run Collection" : collectState === "submitting" ? "Starting..." : "Queued"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={reportState !== "idle"}
          onClick={() => triggerJob("report", setReportState)}
        >
          {reportState === "submitting" && <Loader2 className="w-3 h-3 animate-spin mr-1.5" />}
          {reportState === "accepted" && <Check className="w-3 h-3 mr-1.5" />}
          {reportState === "idle" ? "Send Report" : reportState === "submitting" ? "Starting..." : "Queued"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={techStackState !== "idle"}
          onClick={() => triggerJob("tech-stack-backfill", setTechStackState)}
        >
          {techStackState === "submitting" && <Loader2 className="w-3 h-3 animate-spin mr-1.5" />}
          {techStackState === "accepted" && <Check className="w-3 h-3 mr-1.5" />}
          {techStackState === "idle" ? "Refresh Tech Stacks" : techStackState === "submitting" ? "Starting..." : "Queued"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={insightRefreshState !== "idle"}
          onClick={() => triggerJob("company-insights-refresh", setInsightRefreshState)}
        >
          {insightRefreshState === "submitting" && <Loader2 className="w-3 h-3 animate-spin mr-1.5" />}
          {insightRefreshState === "accepted" && <Check className="w-3 h-3 mr-1.5" />}
          {insightRefreshState === "idle"
            ? "Refresh Strategic Insights"
            : insightRefreshState === "submitting"
              ? "Starting..."
              : "Queued"}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive mt-2">{error}</p>
      )}
    </div>
  );
}
