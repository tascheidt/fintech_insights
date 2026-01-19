"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface DetectionResult {
  detected: boolean;
  atsType?: string;
  atsIdentifier?: string;
  atsLabel?: string;
  normalizedUrl?: string;
  implemented?: boolean;
  verified?: boolean;
  jobCount?: number;
  verifyError?: string;
  message?: string;
}

interface Company {
  id: string;
  name: string;
  slug: string;
  country: string;
  ats_type: string;
  ats_identifier: string;
  careers_url?: string | null;
  track_for_strategy: boolean;
  is_active: boolean;
}

const SUPPORTED_ATS = [
  { value: "lever", label: "Lever" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "workable", label: "Workable" },
  { value: "ashby", label: "Ashby" },
  { value: "dayforce", label: "Dayforce" },
  { value: "workday", label: "Workday" },
  { value: "smartrecruiters", label: "SmartRecruiters" },
  { value: "successfactors", label: "SuccessFactors" },
  { value: "bamboohr", label: "BambooHR" },
  { value: "jazzhr", label: "JazzHR" },
  { value: "recruitee", label: "Recruitee" },
  { value: "custom", label: "Other / Manual" },
];

export function EditCompanyForm({ company }: { company: Company }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [testing, setTesting] = useState(false);

  // Form state
  const [name, setName] = useState(company.name);
  const [careersUrl, setCareersUrl] = useState(company.careers_url ?? "");
  const [country, setCountry] = useState(company.country);
  const [trackForStrategy, setTrackForStrategy] = useState(company.track_for_strategy);
  const [isActive, setIsActive] = useState(company.is_active);

  // ATS settings
  const [atsType, setAtsType] = useState(company.ats_type);
  const [atsIdentifier, setAtsIdentifier] = useState(company.ats_identifier);

  // Detection state
  const [detection, setDetection] = useState<DetectionResult | null>(null);

  // Detect ATS from URL
  const detectATS = useCallback(async () => {
    if (!careersUrl.trim()) return;

    setDetecting(true);
    setDetection(null);

    try {
      const res = await fetch("/api/companies/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: careersUrl }),
      });
      const data: DetectionResult = await res.json();
      setDetection(data);

      // Auto-fill if detected
      if (data.detected && data.atsType && data.atsIdentifier) {
        setAtsType(data.atsType);
        setAtsIdentifier(data.atsIdentifier);
      }
    } catch {
      setDetection({ detected: false, message: "Failed to detect ATS platform" });
    } finally {
      setDetecting(false);
    }
  }, [careersUrl]);

  // Test connection
  async function testConnection() {
    if (!atsType || !atsIdentifier) {
      alert("Please enter ATS platform information first.");
      return;
    }

    setTesting(true);
    try {
      const res = await fetch("/api/companies/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          atsType, 
          atsIdentifier,
          careersUrl: careersUrl || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Success! Found ${data.jobCount} jobs.`);
      } else {
        alert(`Error: ${data.error ?? "Unknown"}`);
      }
    } catch {
      alert("Request failed.");
    } finally {
      setTesting(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!name.trim()) {
      alert("Please enter a company name.");
      return;
    }
    if (!country) {
      alert("Please select a country.");
      return;
    }
    if (!atsType || !atsIdentifier) {
      alert("Please enter ATS platform information.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          country,
          atsType,
          atsIdentifier,
          trackForStrategy,
          careersUrl: (detection?.normalizedUrl ?? careersUrl) || null,
          isActive,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Failed to update company");
        return;
      }
      const data = await res.json();
      router.push(`/companies/${data.slug}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const hasChanges =
    name !== company.name ||
    country !== company.country ||
    atsType !== company.ats_type ||
    atsIdentifier !== company.ats_identifier ||
    careersUrl !== (company.careers_url ?? "") ||
    trackForStrategy !== company.track_for_strategy ||
    isActive !== company.is_active;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Edit Company Settings</h2>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6 max-w-xl">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Company Name *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Careers Page URL</label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={careersUrl}
                  onChange={(e) => {
                    setCareersUrl(e.target.value);
                    setDetection(null);
                  }}
                  placeholder="https://jobs.dayforcehcm.com/..."
                  type="url"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={detectATS}
                  disabled={detecting || !careersUrl.trim()}
                >
                  {detecting ? "Detecting..." : "Detect ATS"}
                </Button>
              </div>
            </div>
          </div>

          {/* Detection Result */}
          {detection && (
            <div
              className={`p-4 rounded-lg border ${
                detection.detected && detection.verified
                  ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
                  : detection.detected
                  ? "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800"
                  : "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"
              }`}
            >
              {detection.detected ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {detection.verified ? (
                      <span className="text-green-600 dark:text-green-400">✓</span>
                    ) : (
                      <span className="text-blue-600 dark:text-blue-400">✓</span>
                    )}
                    <span className="font-medium">
                      Detected: {detection.atsLabel ?? detection.atsType}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Identifier: <code className="bg-muted px-1 rounded">{detection.atsIdentifier}</code>
                    {detection.verified && ` - Found ${detection.jobCount} jobs`}
                  </p>
                  {!detection.verified && detection.verifyError && (
                    <p className="text-sm text-muted-foreground">
                      Note: Could not verify job count (some platforms require browser-based scraping). You can still save these settings.
                    </p>
                  )}
                  {detection.atsType !== atsType && (
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                      Fields updated to detected values
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm">{detection.message}</p>
              )}
            </div>
          )}

          {/* ATS Settings */}
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <p className="text-sm font-medium">ATS Configuration</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">ATS Platform *</label>
                <select
                  value={atsType}
                  onChange={(e) => setAtsType(e.target.value)}
                  className="mt-1 border rounded px-3 py-2 w-full"
                >
                  {SUPPORTED_ATS.map((ats) => (
                    <option key={ats.value} value={ats.value}>
                      {ats.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">ATS Identifier *</label>
                <Input
                  value={atsIdentifier}
                  onChange={(e) => setAtsIdentifier(e.target.value)}
                  placeholder="e.g. qfg"
                  className="mt-1"
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={testConnection}
              disabled={testing || !atsType || !atsIdentifier}
            >
              {testing ? "Testing..." : "Test Connection"}
            </Button>
          </div>

          {/* Additional Options */}
          <div className="flex gap-6 flex-wrap">
            <div>
              <label className="text-sm font-medium">Country *</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                required
                className="mt-1 border rounded px-3 py-2 w-full min-w-[140px]"
              >
                <option value="">Select</option>
                <option value="CA">Canada</option>
                <option value="UK">United Kingdom</option>
                <option value="US">United States</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Strategic Analysis</label>
              <div className="mt-2">
                <input
                  type="checkbox"
                  checked={trackForStrategy}
                  onChange={(e) => setTrackForStrategy(e.target.checked)}
                  id="trackForStrategy"
                />
                <label htmlFor="trackForStrategy" className="ml-2 text-sm">Track for strategic insights</label>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Status</label>
              <div className="mt-2">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  id="isActive"
                />
                <label htmlFor="isActive" className="ml-2 text-sm">Active</label>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading || !hasChanges}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
