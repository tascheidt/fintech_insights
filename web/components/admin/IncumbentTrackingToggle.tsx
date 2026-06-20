"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, Landmark } from "lucide-react";

interface IncumbentTrackingToggleProps {
  initialEnabled: boolean;
}

/**
 * Admin control for the incumbent-tracking master switch. Toggling writes the
 * `incumbent_tracking_enabled` row via PUT /api/admin/settings, then refreshes
 * the server tree so dependent surfaces re-read the flag.
 *
 * Off (default) hides all incumbent scraping, AI processing, and UI; on brings
 * the big banks back. No data is deleted either way.
 */
export function IncumbentTrackingToggle({ initialEnabled }: IncumbentTrackingToggleProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onToggle = useCallback(
    async (next: boolean) => {
      if (saving) return;
      const prev = enabled;
      setEnabled(next); // optimistic
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: "incumbent_tracking_enabled",
            value: { enabled: next },
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed (${res.status})`);
        }
        // Re-read the flag everywhere it gates server rendering.
        router.refresh();
      } catch (e) {
        setEnabled(prev); // roll back optimistic update
        setError(e instanceof Error ? e.message : "Failed to update setting");
      } finally {
        setSaving(false);
      }
    },
    [enabled, saving, router]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Landmark className="h-4 w-4 text-muted-foreground" />
              Incumbent tracking
            </h3>
            <CardDescription className="mt-1 max-w-[68ch]">
              Master switch for the big incumbent banks (RBC, BMO, TD, CIBC,
              National Bank, Scotiabank). When <strong>off</strong>, their
              scraping, AI processing, and every incumbent UI surface (dashboard
              rail, Companies “Incumbents” lens, Jobs tier filter, Incumbent
              Watch in the weekly digest) are hidden — but all already-collected
              data is preserved, so turning it back <strong>on</strong> restores
              everything. Default is off to control scrape volume and AI cost.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            {saving && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            <Switch
              checked={enabled}
              disabled={saving}
              onCheckedChange={onToggle}
              aria-label="Toggle incumbent tracking"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            Status:{" "}
            <span className={enabled ? "font-medium text-foreground" : "font-medium text-muted-foreground"}>
              {enabled ? "On — incumbents tracked" : "Off — fintech-only"}
            </span>
          </span>
          {error && (
            <span className="text-sm text-sunset-600">{error}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
