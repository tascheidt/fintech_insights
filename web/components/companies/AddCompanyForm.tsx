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
  confidence?: string;
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

export function AddCompanyForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [testing, setTesting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [careersUrl, setCareersUrl] = useState("");
  const [country, setCountry] = useState("");

  // Detection state
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualAtsType, setManualAtsType] = useState("");
  const [manualAtsIdentifier, setManualAtsIdentifier] = useState("");

  // Detect ATS from URL
  const detectATS = useCallback(async () => {
    if (!careersUrl.trim()) {
      return;
    }

    setDetecting(true);
    setDetection(null);
    setShowManual(false);

    try {
      const res = await fetch("/api/companies/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: careersUrl }),
      });
      const data: DetectionResult = await res.json();
      setDetection(data);

      if (!data.detected) {
        setShowManual(true);
      }
    } catch {
      setDetection({ detected: false, message: "Failed to detect ATS platform" });
      setShowManual(true);
    } finally {
      setDetecting(false);
    }
  }, [careersUrl]);

  // Test connection with current settings
  async function testConnection() {
    const atsType = detection?.atsType ?? manualAtsType;
    const atsIdentifier = detection?.atsIdentifier ?? manualAtsIdentifier;

    if (!atsType || !atsIdentifier) {
      alert("Please detect or enter ATS platform information first.");
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
          careersUrl: (detection?.normalizedUrl ?? careersUrl) || undefined,
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

    const atsType = showManual ? manualAtsType : detection?.atsType;
    const atsIdentifier = showManual ? manualAtsIdentifier : detection?.atsIdentifier;

    if (!name.trim()) {
      alert("Please enter a company name.");
      return;
    }
    if (!country) {
      alert("Please select a country.");
      return;
    }
    if (!atsType || !atsIdentifier) {
      alert("Please detect or enter ATS platform information.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          country,
          atsType,
          atsIdentifier,
          careersUrl: (detection?.normalizedUrl ?? careersUrl) || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Failed to add company");
        return;
      }
      router.push("/companies");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const hasDetection = detection?.detected && detection.atsType && detection.atsIdentifier;
  const hasManual = showManual && manualAtsType && manualAtsIdentifier;
  const canSubmit = name.trim() && country && (hasDetection || hasManual);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Add New Company</h2>
        <p className="text-sm text-muted-foreground">
          Enter the company name and careers URL - we&apos;ll automatically detect the job board platform.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6 max-w-xl">
          {/* Step 1: Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Company Name *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Neo Financial"
                required
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Careers Page URL *</label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={careersUrl}
                  onChange={(e) => {
                    setCareersUrl(e.target.value);
                    setDetection(null);
                    setShowManual(false);
                  }}
                  placeholder="https://jobs.ashbyhq.com/company"
                  type="url"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={detectATS}
                  disabled={detecting || !careersUrl.trim()}
                >
                  {detecting ? "Detecting..." : "Detect"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Paste the careers page URL and click Detect to auto-configure
              </p>
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
                <div className="space-y-2">
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
                  <div className="text-sm text-muted-foreground">
                    <p>Identifier: <code className="bg-muted px-1 rounded">{detection.atsIdentifier}</code></p>
                    {detection.verified && (
                      <p className="text-green-600 dark:text-green-400 mt-1">
                        Verified! Found {detection.jobCount} jobs
                      </p>
                    )}
                    {!detection.verified && detection.verifyError && (
                      <p className="text-muted-foreground mt-1">
                        Note: Could not verify job count (some platforms like Dayforce require browser-based access). You can still add the company.
                      </p>
                    )}
                    {detection.implemented === false && (
                      <p className="text-yellow-600 dark:text-yellow-400 mt-1">
                        {detection.message}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowManual(true)}
                    className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Override detection
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-red-600 dark:text-red-400">✗</span>
                    <span className="font-medium">Could not detect ATS platform</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{detection.message}</p>
                </div>
              )}
            </div>
          )}

          {/* Manual Override / Fallback */}
          {showManual && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <p className="text-sm font-medium">Manual Configuration</p>
              <div>
                <label className="text-sm font-medium">ATS Platform *</label>
                <select
                  value={manualAtsType}
                  onChange={(e) => setManualAtsType(e.target.value)}
                  className="mt-1 border rounded px-3 py-2 w-full"
                >
                  <option value="">Select platform</option>
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
                  value={manualAtsIdentifier}
                  onChange={(e) => setManualAtsIdentifier(e.target.value)}
                  placeholder="e.g. neofinancial"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Usually found in the careers URL path
                </p>
              </div>
              {detection?.detected && (
                <button
                  type="button"
                  onClick={() => setShowManual(false)}
                  className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                  Use detected values
                </button>
              )}
            </div>
          )}

          {/* Additional Options */}
          <div className="flex gap-4 flex-wrap">
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
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={testConnection}
              disabled={testing || (!hasDetection && !hasManual)}
            >
              {testing ? "Testing..." : "Test Connection"}
            </Button>
            <Button type="submit" disabled={loading || !canSubmit}>
              {loading ? "Adding..." : "Add Company"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
