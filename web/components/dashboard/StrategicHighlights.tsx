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
            <TrendingUp className="h-4 w-4" />
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
            <TrendingUp className="h-4 w-4" />
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
          {/* Hiring Activity */}
          {trends.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Hiring Activity
              </p>
              {trends.map((trend, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {trend.trend.replace(/ hiring surge$/, "").replace(/ adoption$/, "")}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {trend.jobCount} roles
                    </span>
                    {trend.direction === "new" && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                        tech
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

          {/* Strategy Signals */}
          {signals.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Strategic Alignments
              </p>
              {signals.map((signal, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {signal.company}
                    </span>
                    <span
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        signal.alignment === "strong"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                          : signal.alignment === "moderate"
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      {signal.alignment}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {signal.signal}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
