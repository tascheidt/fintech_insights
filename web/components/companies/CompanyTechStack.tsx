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

// Tech-stack categories use the design-system soft-chip variants. The mapping
// follows the same logic as before (banking → growth/primary; dev → primary;
// data → highlight via sun; ops → accent) but reaches for tokens, not raw
// Tailwind palette utilities.
const CATEGORY_COLORS: Record<string, string> = {
  // Banking / financial systems → primary-soft (Pacific)
  banking_platforms:        "bg-primary-soft text-primary-soft-foreground border-primary/20",
  financial_systems:        "bg-primary-soft text-primary-soft-foreground border-primary/20",
  // Software dev / platform → primary-soft
  dev_stack:                "bg-primary-soft text-primary-soft-foreground border-primary/20",
  application_stack:        "bg-primary-soft text-primary-soft-foreground border-primary/20",
  platform_infrastructure:  "bg-primary-soft text-primary-soft-foreground border-primary/20",
  // Data / analytics → highlight-soft (Sunset)
  data_analytics:           "bg-highlight-soft text-highlight-soft-foreground border-highlight/20",
  data_ai:                  "bg-highlight-soft text-highlight-soft-foreground border-highlight/20",
  // Operations / business tooling → accent-soft (Sun)
  business_operations:      "bg-accent-soft text-accent-soft-foreground border-accent/20",
  // Legacy categories (backward compat)
  languages:                "bg-primary-soft text-primary-soft-foreground border-primary/20",
  frameworks:               "bg-primary-soft text-primary-soft-foreground border-primary/20",
  cloud:                    "bg-primary-soft text-primary-soft-foreground border-primary/20",
  devops:                   "bg-primary-soft text-primary-soft-foreground border-primary/20",
  databases:                "bg-primary-soft text-primary-soft-foreground border-primary/20",
  data_tools:               "bg-highlight-soft text-highlight-soft-foreground border-highlight/20",
  ai_ml:                    "bg-highlight-soft text-highlight-soft-foreground border-highlight/20",
  // Default fallback
  other:                    "bg-muted text-muted-foreground border-border",
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
              <p className="text-sm text-destructive">{error}</p>
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
        <span className="text-destructive">{error}</span>
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
