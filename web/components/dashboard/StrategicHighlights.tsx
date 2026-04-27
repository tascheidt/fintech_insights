/**
 * StrategySignals — strategic alignments + industry trends summary.
 *
 * Visual contract (design system):
 * - Strength dot: 7×7 circle, color depends on alignment.
 *   strong  → growth-500 / moderate → accent / weak → muted-foreground / contradicting → highlight
 * - "kind" eyebrow: mono uppercase tracked, muted.
 * - Chips: bg-accent-soft / bg-primary-soft / bg-muted (token-driven).
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import { TrendingUp, ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LatestDigest } from "@/lib/dashboard-queries";

const ALIGNMENT_DOT: Record<string, string> = {
  strong: "bg-growth-500",
  moderate: "bg-accent",
  weak: "bg-muted-foreground",
  contradicting: "bg-highlight",
};

const ALIGNMENT_CHIP: Record<string, string> = {
  strong: "bg-primary-soft text-primary-soft-foreground",
  moderate: "bg-accent-soft text-accent-soft-foreground",
  weak: "bg-muted text-muted-foreground",
  contradicting: "bg-highlight-soft text-highlight-soft-foreground",
};

export function StrategySignals({
  digest,
}: {
  digest: LatestDigest | null;
}) {
  const trends = digest?.industryTrends?.slice(0, 3) ?? [];
  const signals = digest?.strategySignals?.slice(0, 3) ?? [];

  if (trends.length === 0 && signals.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Strategy Signals
          </CardTitle>
          <CardDescription>Industry trends and strategic alignments</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No strategy signals available yet. Check back after the next digest.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Strategy Signals
          </CardTitle>
          <CardDescription>Industry trends and strategic alignments</CardDescription>
        </div>
        {digest && (
          <Link
            href={`/digests/${digest.id}`}
            className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
          >
            Full digest <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </CardHeader>
      <CardContent>
        <div className="max-h-[400px] overflow-y-auto space-y-5">
          {trends.length > 0 && (
            <div className="space-y-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Hiring Activity
              </p>
              {trends.map((trend, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {trend.trend.replace(/ hiring surge$/, "").replace(/ adoption$/, "")}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {trend.jobCount} roles
                    </span>
                    {trend.direction === "new" && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary-soft text-primary-soft-foreground">
                        new
                      </span>
                    )}
                  </div>
                  {trend.companies?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {trend.companies.map((company) => (
                        <span
                          key={company}
                          className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
                        >
                          {company}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {signals.length > 0 && (
            <div className="space-y-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Strategic Alignments
              </p>
              {signals.map((signal, i) => {
                const dotClass = ALIGNMENT_DOT[signal.alignment] ?? ALIGNMENT_DOT.weak;
                const chipClass = ALIGNMENT_CHIP[signal.alignment] ?? ALIGNMENT_CHIP.weak;
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn("h-[7px] w-[7px] rounded-full shrink-0", dotClass)}
                      />
                      <span className="text-sm font-medium text-foreground">
                        {signal.company}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded",
                          chipClass
                        )}
                      >
                        {signal.alignment}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-[15px]">
                      {signal.signal}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
