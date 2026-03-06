"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CompanyTechStack as TechStack } from "@/lib/ai/tech-stack-extraction";

interface CompanyTechStackProps {
  companyId: string;
  initialTechStack: TechStack | null;
  initialGeneratedAt: string | null;
}

// 3 color families + gray fallback (Notion-style, muted)
const CATEGORY_COLORS: Record<string, string> = {
  // Green: banking/financial systems
  banking_platforms: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  financial_systems: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  // Blue: software development and platform
  dev_stack: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  application_stack: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  platform_infrastructure: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
  // Purple: data/analytics
  data_analytics: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  data_ai: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  // Amber: operations and business tooling
  business_operations: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  // Legacy categories (backward compat)
  languages: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  frameworks: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  cloud: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  devops: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  databases: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  data_tools: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  ai_ml: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  // Gray: everything else
  other: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700",
};

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getFrequencyLabel(count: number, total: number): string {
  const pct = (count / total) * 100;
  if (pct >= 30) return "Core";
  return "";
}

export function CompanyTechStack({
  companyId,
  initialTechStack,
  initialGeneratedAt,
}: CompanyTechStackProps) {
  const [techStack, setTechStack] = useState<TechStack | null>(initialTechStack);
  const [generatedAt, setGeneratedAt] = useState<string | null>(initialGeneratedAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setError(null);
    setErrorStatus(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/tech-stack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate tech stack");
        setErrorStatus(res.status);
        return;
      }

      setTechStack(data.techStack);
      setGeneratedAt(new Date().toISOString());
    } catch {
      setError("An error occurred. Please try again.");
      setErrorStatus(500);
    } finally {
      setLoading(false);
    }
  }

  // State 1: Pending (no data yet)
  if (!techStack || techStack.categories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">Tech Stack</h3>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="space-y-2">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="text-sm text-primary hover:underline"
              >
                {loading ? "Retrying..." : "Try again"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Tech stack extraction scheduled — will be ready after the next collection run.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // State 3: Error on populated card
  const renderError = () => {
    if (!error) return null;
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-red-600 dark:text-red-400">{error}</span>
        {errorStatus !== 429 && (
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="text-primary hover:underline"
          >
            {loading ? "Retrying..." : "Try again"}
          </button>
        )}
      </div>
    );
  };

  // State 2: Populated
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Tech Stack</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Extracted from {techStack.totalJobsAnalyzed} job descriptions
              {generatedAt && <> &middot; Updated {formatDate(generatedAt)}</>}
            </p>
          </div>
          <div className="relative">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
              title="Refresh tech stack"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {renderError()}

        {/* Architect Summary */}
        {techStack.architectSummary && (
          <p className="text-sm text-muted-foreground leading-relaxed border-l-2 border-muted pl-3">
            {techStack.architectSummary}
          </p>
        )}

        {techStack.categories.map((cat) => (
          <div key={cat.category}>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">
              {cat.label}
            </h4>
            {cat.narrativeSummary && (
              <p className="text-xs text-muted-foreground mb-2">
                {cat.narrativeSummary}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {cat.technologies.map((tech) => {
                const freqLabel = getFrequencyLabel(tech.count, techStack.totalJobsAnalyzed);
                const colorClass = CATEGORY_COLORS[cat.category] ?? CATEGORY_COLORS.other;

                return (
                  <span
                    key={tech.name}
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border",
                      colorClass
                    )}
                    title={`Mentioned in ${tech.count} job${tech.count !== 1 ? "s" : ""} (${formatDate(tech.firstSeen)} - ${formatDate(tech.lastSeen)})`}
                  >
                    {tech.name}
                    {freqLabel && (
                      <span className="opacity-50 text-[10px] uppercase tracking-wide">
                        {freqLabel}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
