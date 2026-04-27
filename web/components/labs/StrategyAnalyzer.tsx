"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { StrategyTimeline } from "./StrategyTimeline";
import { StrategyGantt } from "./StrategyGantt";
import type { StrategyAnalysisResult } from "@/lib/ai/strategy-analysis";

interface Company {
  id: string;
  name: string;
  slug: string;
}

// Loading phase messages
const LOADING_PHASES = [
  { message: "Fetching job postings...", until: 3000 },
  { message: "Clustering roles into strategic themes...", until: 7000 },
  { message: "Generating strategic assessment...", until: 12000 },
  { message: "Finalizing analysis...", until: Infinity },
];

function useLoadingPhase(loading: boolean) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    const interval = setInterval(() => setElapsed(Date.now() - start), 200);
    return () => {
      clearInterval(interval);
      // Reset on cleanup so the next loading run starts fresh.
      setElapsed(0);
    };
  }, [loading]);

  const phase = LOADING_PHASES.find((p) => elapsed < p.until) ?? LOADING_PHASES[LOADING_PHASES.length - 1];
  // Cosmetic progress: ramps up quickly then slows (asymptotic to 95%)
  const progress = Math.min(95, (1 - Math.exp(-elapsed / 8000)) * 100);

  return { message: phase.message, progress };
}

function formatAnalysisAsMarkdown(result: StrategyAnalysisResult): string {
  const lines: string[] = [];
  lines.push(`# ${result.companyName} — Strategy Inference`);
  lines.push(`*${result.totalJobsAnalyzed} jobs analyzed | ${result.initiatives.length} initiatives identified*`);
  lines.push("");

  // Assessment
  const a = result.overallAssessment;
  if (typeof a === "string") {
    lines.push(`## Strategic Assessment\n${a}`);
  } else {
    lines.push(`## Strategic Assessment`);
    lines.push(`**${a.headline}**`);
    lines.push(a.details);
    if (a.keyRisk) lines.push(`\n> **Key Risk:** ${a.keyRisk}`);
  }
  lines.push("");

  // Initiatives
  for (const init of result.initiatives) {
    lines.push(`### ${init.name} (${init.confidence} confidence)`);
    lines.push(init.description);
    if (init.signals.length > 0) {
      lines.push("\n**Signals:**");
      for (const s of init.signals) lines.push(`- ${s}`);
    }
    if (init.roles.length > 0) {
      lines.push(`\n**Roles:** ${init.roles.map((r) => r.title).join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function StrategyAnalyzer({ companies }: { companies: Company[] }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [result, setResult] = useState<StrategyAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const { message: loadingMessage, progress: loadingProgress } = useLoadingPhase(loading);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function runAnalysis() {
    if (!selectedCompanyId) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setExpandedIds(new Set());

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

  async function copyAnalysis() {
    if (!result) return;
    const md = formatAnalysisAsMarkdown(result);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  // Compute summary stats
  const totalMappedRoles = result?.initiatives.reduce((sum, i) => sum + i.roles.length, 0) ?? 0;
  const ongoingCount = result?.initiatives.filter((i) => i.timeframe.isOngoing).length ?? 0;
  const topCategory = result ? (() => {
    const counts: Record<string, number> = {};
    for (const i of result.initiatives) counts[i.category] = (counts[i.category] ?? 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] ?? null;
  })() : null;
  const confidenceDist = result ? {
    high: result.initiatives.filter((i) => i.confidence === "high").length,
    medium: result.initiatives.filter((i) => i.confidence === "medium").length,
    low: result.initiatives.filter((i) => i.confidence === "low").length,
  } : null;

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

      {/* Phased Loading */}
      {loading && (
        <Card>
          <CardContent className="py-10">
            <div className="flex flex-col items-center gap-4 text-center max-w-sm mx-auto">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              <div className="w-full space-y-2">
                <p className="text-sm font-medium">{loadingMessage}</p>
                <Progress value={loadingProgress} />
                <p className="text-xs text-muted-foreground">
                  Analyzing {selectedCompany?.name ?? "company"} hiring patterns
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
        <div className="space-y-5">
          {/* Header with export */}
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
            <Button variant="outline" size="sm" onClick={copyAnalysis}>
              {copied ? "Copied!" : "Copy Analysis"}
            </Button>
          </div>

          {/* Summary Stats */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs font-medium text-muted-foreground">Roles Mapped</p>
                <p className="text-xl font-bold mt-0.5">
                  {totalMappedRoles}
                  <span className="text-sm font-normal text-muted-foreground ml-1">/ {result.totalJobsAnalyzed}</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs font-medium text-muted-foreground">Ongoing</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xl font-bold">{ongoingCount}</p>
                  {ongoingCount > 0 && (
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs font-medium text-muted-foreground">Top Category</p>
                {topCategory && (
                  <p className="text-sm font-semibold mt-1 truncate">{
                    {
                      "market-expansion": "Market Expansion",
                      "new-product": "New Product",
                      "technology-investment": "Technology Investment",
                      "regulatory-preparation": "Regulatory Preparation",
                      "operational-scaling": "Operational Scaling",
                      "talent-upgrade": "Talent Upgrade",
                      "cost-optimization": "Cost Optimization",
                      "customer-experience": "Customer Experience",
                      "ai-data-capabilities": "AI & Data Capabilities",
                      other: "Other",
                    }[topCategory] ?? topCategory
                  }</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs font-medium text-muted-foreground">Confidence</p>
                {confidenceDist && (
                  <div className="flex items-center gap-1 mt-2 h-3">
                    {confidenceDist.high > 0 && (
                      <div
                        className="h-full rounded-sm bg-green-500"
                        style={{ flex: confidenceDist.high }}
                        title={`${confidenceDist.high} high`}
                      />
                    )}
                    {confidenceDist.medium > 0 && (
                      <div
                        className="h-full rounded-sm bg-yellow-400"
                        style={{ flex: confidenceDist.medium }}
                        title={`${confidenceDist.medium} medium`}
                      />
                    )}
                    {confidenceDist.low > 0 && (
                      <div
                        className="h-full rounded-sm bg-gray-300"
                        style={{ flex: confidenceDist.low }}
                        title={`${confidenceDist.low} low`}
                      />
                    )}
                  </div>
                )}
                {confidenceDist && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {confidenceDist.high}H / {confidenceDist.medium}M / {confidenceDist.low}L
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Gantt Timeline */}
          <StrategyGantt
            initiatives={result.initiatives}
            onBarClick={toggleExpand}
          />

          {/* Detail Cards */}
          <StrategyTimeline
            initiatives={result.initiatives}
            overallAssessment={result.overallAssessment}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
          />
        </div>
      )}
    </div>
  );
}
