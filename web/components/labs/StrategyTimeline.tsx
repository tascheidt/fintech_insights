"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { StrategicInitiative, StructuredAssessment } from "@/lib/ai/strategy-analysis";

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  "market-expansion": { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-500" },
  "new-product": { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", dot: "bg-purple-500" },
  "technology-investment": { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", dot: "bg-cyan-500" },
  "regulatory-preparation": { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" },
  "operational-scaling": { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
  "talent-upgrade": { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
  "cost-optimization": { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700", dot: "bg-gray-500" },
  "customer-experience": { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700", dot: "bg-pink-500" },
  "ai-data-capabilities": { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", dot: "bg-violet-500" },
  "other": { bg: "bg-zinc-50", border: "border-zinc-200", text: "text-zinc-700", dot: "bg-zinc-500" },
};

const CATEGORY_LABELS: Record<string, string> = {
  "market-expansion": "Market Expansion",
  "new-product": "New Product",
  "technology-investment": "Technology Investment",
  "regulatory-preparation": "Regulatory Preparation",
  "operational-scaling": "Operational Scaling",
  "talent-upgrade": "Talent Upgrade",
  "cost-optimization": "Cost Optimization",
  "customer-experience": "Customer Experience",
  "ai-data-capabilities": "AI & Data Capabilities",
  "other": "Other",
};

const CATEGORY_COLORS_HEX: Record<string, string> = {
  "market-expansion": "#3b82f6",
  "new-product": "#a855f7",
  "technology-investment": "#06b6d4",
  "regulatory-preparation": "#ef4444",
  "operational-scaling": "#f59e0b",
  "talent-upgrade": "#10b981",
  "cost-optimization": "#6b7280",
  "customer-experience": "#ec4899",
  "ai-data-capabilities": "#8b5cf6",
  other: "#71717a",
};

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
};

// ============================================================================
// Helper
// ============================================================================

function formatDate(dateStr: string): string {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ============================================================================
// Component
// ============================================================================

export function StrategyTimeline({
  initiatives,
  overallAssessment,
  expandedIds,
  onToggleExpand,
}: {
  initiatives: StrategicInitiative[];
  overallAssessment: string | StructuredAssessment;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  if (initiatives.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No strategic initiatives identified from available job data.</p>
      </div>
    );
  }

  // Sort by confidence (high first), then by number of roles
  const sorted = [...initiatives].sort((a, b) => {
    const confOrder = { high: 0, medium: 1, low: 2 };
    const confDiff = confOrder[a.confidence] - confOrder[b.confidence];
    if (confDiff !== 0) return confDiff;
    return b.roles.length - a.roles.length;
  });

  return (
    <div className="space-y-6">
      {/* Overall Assessment */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-8 w-8 rounded-full bg-foreground/5 flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-foreground/70">AI</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-muted-foreground mb-1">Strategic Assessment</p>
              {typeof overallAssessment === "string" ? (
                <p className="text-sm leading-relaxed">{overallAssessment}</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">{overallAssessment.headline}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{overallAssessment.details}</p>
                  {overallAssessment.keyRisk && (
                    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-xs font-medium text-amber-800">Key Risk</p>
                      <p className="text-sm text-amber-700">{overallAssessment.keyRisk}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Filter */}
      {(() => {
        const categoryCounts: Record<string, number> = {};
        for (const init of sorted) {
          const cat = init.category;
          categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
        }
        return (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setActiveCategory(null)}
              className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                activeCategory === null
                  ? "bg-foreground text-background border-foreground"
                  : "bg-muted text-muted-foreground border-transparent hover:bg-accent"
              }`}
            >
              All ({sorted.length})
            </button>
            {Object.entries(categoryCounts).map(([cat, count]) => {
              const colors = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.other;
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(isActive ? null : cat)}
                  className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                    isActive
                      ? `${colors.bg} ${colors.text} ${colors.border}`
                      : "bg-muted text-muted-foreground border-transparent hover:bg-accent"
                  }`}
                >
                  {CATEGORY_LABELS[cat] ?? cat} ({count})
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Initiative Cards */}
      <div className="space-y-3">
          {sorted
            .filter((i) => !activeCategory || i.category === activeCategory)
            .map((initiative) => {
            const colors = CATEGORY_COLORS[initiative.category] ?? CATEGORY_COLORS.other;
            const isExpanded = expandedIds.has(initiative.id);
            const totalRoles = sorted.reduce((sum, i) => sum + i.roles.length, 0);
            const roleFraction = totalRoles > 0 ? (initiative.roles.length / totalRoles) * 100 : 0;

            return (
              <div key={initiative.id}>
                <button
                  onClick={() => onToggleExpand(initiative.id)}
                  className={`w-full text-left rounded-lg border p-4 transition-colors hover:bg-accent/50 ${isExpanded ? "ring-1 ring-ring" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-sm">{initiative.name}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${colors.bg} ${colors.text} ${colors.border} border`}>
                          {CATEGORY_LABELS[initiative.category] ?? initiative.category}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${CONFIDENCE_STYLES[initiative.confidence]}`}>
                          {initiative.confidence}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{initiative.description}</p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className="text-xs text-muted-foreground">
                        {initiative.roles.length} role{initiative.roles.length !== 1 ? "s" : ""}
                      </p>
                      {/* Mini role distribution bar */}
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.max(roleFraction, 8)}%`, backgroundColor: CATEGORY_COLORS_HEX[initiative.category] ?? "#71717a" }}
                        />
                      </div>
                      {initiative.timeframe.firstPosting && (
                        <p className="text-xs text-muted-foreground">
                          {formatDate(initiative.timeframe.firstPosting)}
                          {initiative.timeframe.lastPosting !== initiative.timeframe.firstPosting && (
                            <> &mdash; {formatDate(initiative.timeframe.lastPosting)}</>
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-4" onClick={(e) => e.stopPropagation()}>
                      {/* Signals */}
                      {initiative.signals.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Signals</p>
                          <ul className="space-y-1">
                            {initiative.signals.map((signal, i) => (
                              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${colors.dot}`} />
                                {signal}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Roles */}
                      {initiative.roles.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Related Roles</p>
                          <div className="flex flex-wrap gap-1.5">
                            {initiative.roles.map((role) => (
                              <Link
                                key={role.jobId}
                                href={`/jobs/${role.jobId}`}
                                className="inline-flex flex-col px-2 py-1 rounded-md bg-muted text-xs hover:bg-accent transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span>{role.title}</span>
                                {role.relevance && role.relevance !== "unknown" && (
                                  <span className="text-[10px] text-muted-foreground">{role.relevance}</span>
                                )}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Status */}
                      {initiative.timeframe.isOngoing && (
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-xs text-green-600 font-medium">Ongoing — still actively hiring</span>
                        </div>
                      )}
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
    </div>
  );
}
