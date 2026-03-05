"use client";

import type { StrategicInitiative } from "@/lib/ai/strategy-analysis";

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

function monthsBetween(start: Date, end: Date): string[] {
  const months: string[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (current <= last) {
    months.push(
      current.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
    );
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

export function StrategyGantt({
  initiatives,
  onBarClick,
}: {
  initiatives: StrategicInitiative[];
  onBarClick?: (id: string) => void;
}) {
  if (initiatives.length === 0) return null;

  // Find global date range
  const allDates = initiatives
    .flatMap((i) => [i.timeframe.firstPosting, i.timeframe.lastPosting])
    .filter(Boolean)
    .map((d) => new Date(d).getTime());

  if (allDates.length === 0) return null;

  const globalMin = new Date(Math.min(...allDates));
  const globalMax = new Date(Math.max(...allDates));

  // Pad range by 1 month on each side
  const rangeStart = new Date(globalMin.getFullYear(), globalMin.getMonth(), 1);
  const rangeEnd = new Date(
    globalMax.getFullYear(),
    globalMax.getMonth() + 2,
    0
  );

  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  const months = monthsBetween(rangeStart, rangeEnd);

  function pct(date: string): number {
    const ms = new Date(date).getTime() - rangeStart.getTime();
    return Math.max(0, Math.min(100, (ms / totalMs) * 100));
  }

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Month header */}
        <div className="flex border-b">
          <div className="w-[160px] shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground border-r">
            Initiative
          </div>
          <div className="flex-1 relative h-8">
            {months.map((month, i) => (
              <div
                key={month}
                className="absolute top-0 bottom-0 flex items-center text-[10px] text-muted-foreground"
                style={{
                  left: `${(i / months.length) * 100}%`,
                  width: `${100 / months.length}%`,
                  paddingLeft: "4px",
                  borderLeft: i > 0 ? "1px solid var(--border)" : undefined,
                }}
              >
                {month}
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        {initiatives.map((initiative) => {
          const color =
            CATEGORY_COLORS_HEX[initiative.category] ??
            CATEGORY_COLORS_HEX.other;
          const hasTimeframe =
            initiative.timeframe.firstPosting &&
            initiative.timeframe.lastPosting;

          const left = hasTimeframe
            ? pct(initiative.timeframe.firstPosting)
            : 0;
          const right = hasTimeframe
            ? pct(initiative.timeframe.lastPosting)
            : 0;
          // Minimum bar width of 3% so single-day initiatives are visible
          const width = Math.max(right - left, 3);

          return (
            <div
              key={initiative.id}
              className="flex items-center border-b last:border-b-0 hover:bg-accent/30 transition-colors cursor-pointer"
              onClick={() => onBarClick?.(initiative.id)}
            >
              <div className="w-[160px] shrink-0 px-3 py-2 text-xs font-medium truncate border-r">
                {initiative.name}
              </div>
              <div className="flex-1 relative h-10 flex items-center">
                {hasTimeframe && (
                  <div
                    className="absolute h-6 rounded-sm flex items-center justify-end pr-2 transition-all"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: color,
                      opacity: 0.85,
                    }}
                  >
                    {initiative.timeframe.isOngoing && (
                      <span className="h-2 w-2 rounded-full bg-white animate-pulse shrink-0" />
                    )}
                  </div>
                )}
                {/* Role count badge */}
                <div
                  className="absolute right-2 text-[10px] text-muted-foreground"
                >
                  {initiative.roles.length} role
                  {initiative.roles.length !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
