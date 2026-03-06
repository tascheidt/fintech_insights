"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TechItem {
  name: string;
  count: number;
  lastSeen: string;
  firstSeen: string;
}

interface TechCategory {
  category: string;
  label: string;
  technologies: TechItem[];
}

interface TechStack {
  categories: TechCategory[];
  totalJobsAnalyzed: number;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
}

interface CompanyTechStackProps {
  companyId: string;
  companyName: string;
  initialTechStack: TechStack | null;
  initialGeneratedAt: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  languages: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  frameworks: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  databases: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  cloud: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800",
  devops: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  data_tools: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  ai_ml: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950 dark:text-pink-300 dark:border-pink-800",
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
  if (pct >= 10) return "Common";
  return "";
}

export function CompanyTechStack({
  companyId,
  companyName,
  initialTechStack,
  initialGeneratedAt,
}: CompanyTechStackProps) {
  const [techStack, setTechStack] = useState<TechStack | null>(initialTechStack);
  const [generatedAt, setGeneratedAt] = useState<string | null>(initialGeneratedAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/tech-stack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate tech stack");
        return;
      }

      setTechStack(data.techStack);
      setGeneratedAt(new Date().toISOString());
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Empty state
  if (!techStack || techStack.categories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Tech Stack</h3>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? "Analyzing..." : "Generate Tech Stack"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : loading ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Analyzing job descriptions for {companyName}...
              </p>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary/60 rounded-full animate-pulse" style={{ width: "60%" }} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No tech stack data yet. Click &quot;Generate Tech Stack&quot; to analyze job descriptions
              and extract technology keywords.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const totalMentions = techStack.categories.reduce(
    (sum, cat) => sum + cat.technologies.reduce((s, t) => s + t.count, 0),
    0
  );

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
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {techStack.categories.map((cat) => (
          <div key={cat.category}>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              {cat.label}
            </h4>
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
                    {tech.count > 1 && (
                      <span className="opacity-60 text-[10px]">{tech.count}</span>
                    )}
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
