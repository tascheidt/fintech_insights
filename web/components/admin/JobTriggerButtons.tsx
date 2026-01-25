"use client";

import { Button } from "@/components/ui/button";

interface JobTriggerButtonsProps {
  onTriggered?: () => void;
}

export function JobTriggerButtons({ onTriggered }: JobTriggerButtonsProps) {
  const triggerJob = async (jobType: "collect" | "report") => {
    try {
      // Fire and forget - don't wait for response
      fetch("/api/admin/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_type: jobType }),
      }).then((res) => {
        if (res.ok && onTriggered) {
          // Refresh logs after a short delay
          setTimeout(onTriggered, 2000);
        }
      }).catch((e) => {
        console.error("Failed to trigger job:", e);
      });
    } catch (e) {
      console.error("Failed to trigger job:", e);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => triggerJob("collect")}
      >
        Run Collection
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => triggerJob("report")}
      >
        Send Report
      </Button>
    </div>
  );
}
