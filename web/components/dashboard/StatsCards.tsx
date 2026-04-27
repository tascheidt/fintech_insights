/**
 * StatsCards — the dashboard's hero stat row.
 *
 * Visual contract (design system → StatCard):
 * - Plain card chrome (NOT shadcn Card — too heavy).
 *   `bg-card border border-border rounded-[10px] p-4 px-[18px]`
 * - Label: 12px medium muted-foreground.
 * - Value: 26px bold tabular-nums, tracking -0.02em.
 * - Positive net: growth-500 (`text-growth-500`). Never destructive.
 * - Sparkline: stroke-primary.
 * - Hover (linked): bg-secondary + shadow-sm.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface StatCardDef {
  label: string;
  value: ReactNode;
  subtitle?: string;
  href?: string;
  sparkline?: number[];
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 60;
  const height = 20;

  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  });

  return (
    <svg
      width={width}
      height={height}
      className="text-primary"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <path
        d={`M ${points.join(" L ")}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StatsCards({
  activeJobs,
  netThisWeek,
  avgWeeklyVelocity,
  companiesTracked,
  sparklineData,
}: {
  activeJobs: number;
  netThisWeek: { newCount: number; closedCount: number };
  avgWeeklyVelocity: number;
  companiesTracked: number;
  sparklineData: number[];
}) {
  const net = netThisWeek.newCount - netThisWeek.closedCount;

  const stats: StatCardDef[] = [
    {
      label: "Active Jobs",
      value: activeJobs,
      href: "/jobs?status=active",
      sparkline: sparklineData,
    },
    {
      label: "7-Day Net",
      value: (
        // Positive uses growth (Pacific-adjacent green); negative uses sunset
        // (slowdown, NOT error) per design-system rule.
        <span className={net >= 0 ? "text-growth-500" : "text-sunset-600"}>
          {net >= 0 ? "+" : ""}{net}
        </span>
      ),
      subtitle: `${netThisWeek.newCount} new · ${netThisWeek.closedCount} closed`,
      href: "/jobs?time=7days",
    },
    {
      label: "Avg Weekly Velocity",
      value: avgWeeklyVelocity,
      subtitle: "new postings/week",
    },
    {
      label: "Companies Tracked",
      value: companiesTracked,
      href: "/companies",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-[14px] lg:grid-cols-4">
      {stats.map(({ label, value, subtitle, href, sparkline }) => {
        const card = (
          <div
            className={cn(
              "h-full rounded-[10px] border border-border bg-card px-[18px] py-4 transition-colors",
              href && "hover:bg-secondary hover:shadow-sm"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {label}
              </span>
              {sparkline && sparkline.length >= 2 && (
                <Sparkline data={sparkline} />
              )}
            </div>
            <div className="mt-2 text-[26px] font-bold tabular-nums tracking-[-0.02em]">
              {value}
            </div>
            {subtitle && (
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        );

        if (href) {
          return (
            <Link key={label} href={href} className="block h-full">
              {card}
            </Link>
          );
        }
        return <div key={label}>{card}</div>;
      })}
    </div>
  );
}
