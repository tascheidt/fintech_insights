"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface JobSettings {
  frequency: string;
  time: string;
  timezone: string;
  enabled: boolean;
  day?: string;
}

interface AnalysisSettings {
  auto_analyze: boolean;
  min_confidence: string;
  max_insights_per_run: number;
}

interface Settings {
  job_collection?: { value: JobSettings; description?: string };
  weekly_report?: { value: JobSettings; description?: string };
  analysis_settings?: { value: AnalysisSettings; description?: string };
}

interface JobScheduleSettingsProps {
  initialSettings: Settings;
}

export function JobScheduleSettings({ initialSettings }: JobScheduleSettingsProps) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const jobCollection = settings.job_collection?.value ?? {
    frequency: "daily",
    time: "06:00",
    timezone: "UTC",
    enabled: true,
  };

  const weeklyReport = settings.weekly_report?.value ?? {
    frequency: "weekly",
    day: "monday",
    time: "08:00",
    timezone: "UTC",
    enabled: true,
  };

  const analysisSettings = settings.analysis_settings?.value ?? {
    auto_analyze: true,
    min_confidence: "medium",
    max_insights_per_run: 100,
  };

  const saveSetting = async (key: string, value: unknown) => {
    setSaving(key);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      setMessage({ type: "success", text: "Settings saved successfully" });
      // Update local state
      setSettings((prev) => ({
        ...prev,
        [key]: { value, description: prev[key as keyof Settings]?.description ?? "" },
      }));
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to save" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6">
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

      {/* Job Collection Schedule */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </span>
            Job Collection Schedule
          </h3>
          <CardDescription>
            How often to scrape job postings from tracked companies
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Frequency</label>
              <select
                className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
                value={jobCollection.frequency}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    job_collection: {
                      ...prev.job_collection,
                      value: { ...jobCollection, frequency: e.target.value },
                    },
                  }))
                }
              >
                <option value="hourly">Hourly</option>
                <option value="every_6_hours">Every 6 Hours</option>
                <option value="every_12_hours">Every 12 Hours</option>
                <option value="daily">Daily</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Time (UTC)</label>
              <Input
                type="time"
                value={jobCollection.time}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    job_collection: {
                      ...prev.job_collection,
                      value: { ...jobCollection, time: e.target.value },
                    },
                  }))
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded"
                checked={jobCollection.enabled}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    job_collection: {
                      ...prev.job_collection,
                      value: { ...jobCollection, enabled: e.target.checked },
                    },
                  }))
                }
              />
              <span className="text-sm">Enabled</span>
            </label>
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-3">
              <strong>Current Vercel Cron:</strong> <code className="bg-muted px-1 py-0.5 rounded">0 6 * * *</code> (Daily at 6:00 AM UTC)
            </p>
            <Button
              size="sm"
              onClick={() => saveSetting("job_collection", jobCollection)}
              disabled={saving === "job_collection"}
            >
              {saving === "job_collection" ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Weekly Report Schedule */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/10">
              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </span>
            Weekly Report Schedule
          </h3>
          <CardDescription>
            When to send the weekly intelligence digest email
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Day</label>
              <select
                className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
                value={weeklyReport.day}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    weekly_report: {
                      ...prev.weekly_report,
                      value: { ...weeklyReport, day: e.target.value },
                    },
                  }))
                }
              >
                <option value="sunday">Sunday</option>
                <option value="monday">Monday</option>
                <option value="tuesday">Tuesday</option>
                <option value="wednesday">Wednesday</option>
                <option value="thursday">Thursday</option>
                <option value="friday">Friday</option>
                <option value="saturday">Saturday</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Time (UTC)</label>
              <Input
                type="time"
                value={weeklyReport.time}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    weekly_report: {
                      ...prev.weekly_report,
                      value: { ...weeklyReport, time: e.target.value },
                    },
                  }))
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded"
                checked={weeklyReport.enabled}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    weekly_report: {
                      ...prev.weekly_report,
                      value: { ...weeklyReport, enabled: e.target.checked },
                    },
                  }))
                }
              />
              <span className="text-sm">Enabled</span>
            </label>
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-3">
              <strong>Current Vercel Cron:</strong> <code className="bg-muted px-1 py-0.5 rounded">0 8 * * 1</code> (Monday at 8:00 AM UTC)
            </p>
            <Button
              size="sm"
              onClick={() => saveSetting("weekly_report", weeklyReport)}
              disabled={saving === "weekly_report"}
            >
              {saving === "weekly_report" ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Analysis Settings */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10">
              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </span>
            Analysis Settings
          </h3>
          <CardDescription>
            Configure how strategic insights are generated
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded"
                checked={analysisSettings.auto_analyze}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    analysis_settings: {
                      ...prev.analysis_settings,
                      value: { ...analysisSettings, auto_analyze: e.target.checked },
                    },
                  }))
                }
              />
              <span className="text-sm">Auto-analyze new job postings</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Minimum Confidence</label>
              <select
                className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
                value={analysisSettings.min_confidence}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    analysis_settings: {
                      ...prev.analysis_settings,
                      value: { ...analysisSettings, min_confidence: e.target.value },
                    },
                  }))
                }
              >
                <option value="low">Low (Include all insights)</option>
                <option value="medium">Medium (Moderate filtering)</option>
                <option value="high">High (Strict filtering)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Max Insights per Run</label>
              <Input
                type="number"
                min={10}
                max={500}
                value={analysisSettings.max_insights_per_run}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    analysis_settings: {
                      ...prev.analysis_settings,
                      value: { ...analysisSettings, max_insights_per_run: parseInt(e.target.value) || 100 },
                    },
                  }))
                }
              />
            </div>
          </div>
          <div className="pt-2 border-t">
            <Button
              size="sm"
              onClick={() => saveSetting("analysis_settings", analysisSettings)}
              disabled={saving === "analysis_settings"}
            >
              {saving === "analysis_settings" ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
