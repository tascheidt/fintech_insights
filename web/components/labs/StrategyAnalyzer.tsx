"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StrategyTimeline } from "./StrategyTimeline";
import type { StrategyAnalysisResult } from "@/lib/ai/strategy-analysis";

interface Company {
  id: string;
  name: string;
  slug: string;
}

export function StrategyAnalyzer({ companies }: { companies: Company[] }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [result, setResult] = useState<StrategyAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    if (!selectedCompanyId) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/labs/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: selectedCompanyId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }

      const data: StrategyAnalysisResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Strategy Inference</h2>
          <p className="text-sm text-muted-foreground">
            Select a company to analyze their job postings from the last 12
            months and infer strategic initiatives.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Company</label>
              <Select
                value={selectedCompanyId}
                onValueChange={setSelectedCompanyId}
              >
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Select a company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={runAnalysis}
              disabled={!selectedCompanyId || loading}
            >
              {loading ? "Analyzing..." : "Run Analysis"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading state */}
      {loading && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              <div>
                <p className="text-sm font-medium">
                  Analyzing {selectedCompany?.name ?? "company"} hiring
                  patterns...
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  This may take 10-20 seconds
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-sm text-destructive font-medium">{error}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Check your API key configuration or try again.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{result.companyName}</h2>
              <p className="text-sm text-muted-foreground">
                {result.totalJobsAnalyzed} job
                {result.totalJobsAnalyzed !== 1 ? "s" : ""} analyzed
                &middot; {result.initiatives.length} initiative
                {result.initiatives.length !== 1 ? "s" : ""} identified
              </p>
            </div>
          </div>
          <StrategyTimeline
            initiatives={result.initiatives}
            overallAssessment={result.overallAssessment}
          />
        </div>
      )}
    </div>
  );
}
