import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface StatCardDef {
  label: string;
  value: ReactNode;
  subtitle?: string;
  href?: string;
  sparkline?: number[];
}

function Sparkline({ data, className }: { data: number[]; className?: string }) {
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

  const pathD = `M ${points.join(" L ")}`;

  return (
    <svg
      width={width}
      height={height}
      className={cn("text-primary", className)}
      viewBox={`0 0 ${width} ${height}`}
    >
      <path
        d={pathD}
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
        <span className={net >= 0 ? "text-green-600" : "text-red-500"}>
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
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map(({ label, value, subtitle, href, sparkline }) => {
        const Content = (
          <Card
            className={cn("h-full transition-colors", href && "hover:bg-muted/50")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-sm font-medium text-muted-foreground">
                {label}
              </span>
              {sparkline && sparkline.length >= 2 && (
                <Sparkline data={sparkline} />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
              )}
            </CardContent>
          </Card>
        );

        if (href) {
          return (
            <Link key={label} href={href} className="block h-full">
              {Content}
            </Link>
          );
        }

        return <div key={label}>{Content}</div>;
      })}
    </div>
  );
}
