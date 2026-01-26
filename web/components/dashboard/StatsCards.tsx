import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StatCardData {
  label: string;
  value: number | string;
  href?: string;
  trend?: {
    value: number;
    label: string; // e.g. "vs last week"
    direction: "up" | "down" | "neutral";
  };
}

export function StatsCards({
  activeJobs,
  newToday,
  insightsCount,
  newThisWeek,
  newLastWeek,
}: {
  activeJobs: number;
  newToday: number;
  insightsCount: number;
  newThisWeek: number;
  newLastWeek: number;
}) {
  // Calculate trend for "New This Week"
  let weekTrendValue = 0;
  let weekTrendDirection: "up" | "down" | "neutral" = "neutral";

  if (newLastWeek > 0) {
    weekTrendValue = Math.round(((newThisWeek - newLastWeek) / newLastWeek) * 100);
    weekTrendDirection = weekTrendValue > 0 ? "up" : weekTrendValue < 0 ? "down" : "neutral";
  } else if (newThisWeek > 0) {
    // Growth from zero
    weekTrendValue = 100;
    weekTrendDirection = "up";
  }
  
  const stats: StatCardData[] = [
    { 
      label: "Active Jobs", 
      value: activeJobs,
      href: "/jobs?status=active"
    },
    { 
      label: "New Today", 
      value: newToday,
      href: "/jobs?date=today"
    },
    { 
      label: "Insights", 
      value: insightsCount,
      href: "/digests"
    },
    { 
      label: "New This Week", 
      value: newThisWeek,
      href: "/jobs?date=week",
      trend: {
        value: Math.abs(weekTrendValue),
        label: "vs last week",
        direction: weekTrendDirection
      }
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map(({ label, value, href, trend }) => {
        const Content = (
          <Card className={cn("h-full transition-colors", href && "hover:bg-muted/50")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-sm font-medium text-muted-foreground">{label}</span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
              {trend && (
                <p className="text-xs text-muted-foreground mt-1">
                  <span className={cn(
                    "font-medium",
                    trend.direction === "up" && "text-green-600",
                    trend.direction === "down" && "text-red-600"
                  )}>
                    {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : ""} {trend.value}%
                  </span>
                  {" "}{trend.label}
                </p>
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
