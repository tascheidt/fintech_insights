import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function StatsCards({
  activeJobs,
  newToday,
  insightsCount,
  thisWeek,
}: {
  activeJobs: number;
  newToday: number;
  insightsCount: number;
  thisWeek: number;
}) {
  const stats = [
    { label: "Active Jobs", value: activeJobs },
    { label: "New Today", value: newToday },
    { label: "Insights", value: insightsCount },
    { label: "This Week", value: thisWeek >= 0 ? `+${thisWeek}` : `${thisWeek}` },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map(({ label, value }) => (
        <Card key={label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-sm font-medium text-muted-foreground">{label}</span>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{value}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
