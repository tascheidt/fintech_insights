"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

interface EmailPreferencesProps {
  initialWeeklyDigest: boolean;
}

/**
 * Email Preferences component for user settings
 * Allows users to opt-out of weekly digest emails
 */
export function EmailPreferences({ initialWeeklyDigest }: EmailPreferencesProps) {
  const [weeklyDigest, setWeeklyDigest] = useState(initialWeeklyDigest);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Sync with server state if it changes externally
  useEffect(() => {
    setWeeklyDigest(initialWeeklyDigest);
  }, [initialWeeklyDigest]);

  const handleToggle = async (checked: boolean) => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/user/email-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekly_digest: checked }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update preferences");
      }

      setWeeklyDigest(checked);
      setMessage({
        type: "success",
        text: checked
          ? "Weekly digest emails enabled"
          : "Weekly digest emails disabled",
      });

      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Failed to update preferences",
      });
      // Revert to previous state on error
      setWeeklyDigest(!checked);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Notifications</h2>
        <CardDescription>
          Manage your email notification preferences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <div
            className={`p-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-green-500/10 text-green-600 border border-green-500/20"
                : "bg-red-500/10 text-red-600 border border-red-500/20"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <label htmlFor="weekly-digest" className="text-sm font-medium cursor-pointer">
              Weekly Strategic Digest
            </label>
            <p className="text-sm text-muted-foreground">
              Receive The Fintech Talent Brief — weekly hiring intelligence for fintech
            </p>
          </div>
          <Switch
            id="weekly-digest"
            checked={weeklyDigest}
            onCheckedChange={handleToggle}
            disabled={saving}
            aria-label="Toggle weekly digest emails"
          />
        </div>
      </CardContent>
    </Card>
  );
}
