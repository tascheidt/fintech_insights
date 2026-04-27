"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface GenerateInsightButtonProps {
  companyId: string;
  companyName: string;
}

export function GenerateInsightButton({
  companyId,
  companyName,
}: GenerateInsightButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/companies/${companyId}/insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodDays: 90,
          researchDepth: "deep",
        }),
      });

      const data = await res.json();

      if (res.status === 200 && data.message === "Recent insight exists") {
        setError(
          `An insight was recently generated. Next generation allowed after ${new Date(data.nextAllowedAt).toLocaleDateString()}.`
        );
        return;
      }

      if (!res.ok) {
        setError(data.error || "Failed to generate insight");
        return;
      }

      setSuccess(true);
      // Refresh the page to show the new insight
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Generate Insight</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Strategic Insight</DialogTitle>
          <DialogDescription>
            This will analyze {companyName}&apos;s hiring patterns over the past 90 days
            and compare them against their publicly stated strategy.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="text-sm space-y-2">
            <p>The analysis will include:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Function-level hiring breakdown</li>
              <li>Trend analysis vs previous period</li>
              <li>Deep research into company strategy</li>
              <li>Financial context (if public company)</li>
              <li>Alignment and discrepancy analysis</li>
            </ul>
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-4 p-3 rounded-lg bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200 text-sm">
              Insight generated successfully! Refreshing...
            </div>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Note: Insights can only be generated once every 7 days per company.
            Estimated time: 30-60 seconds.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={loading || success}>
            {loading ? "Generating..." : "Generate Insight"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
