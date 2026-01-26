import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Insight = {
  id: string;
  category: string | null;
  insight_summary: string | null;
  job_posting: {
    title: string;
    company: { name: string } | null;
  } | null;
};

export function RecentInsights({ insights }: { insights: Insight[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h2 className="text-lg font-semibold">Recent Insights</h2>
        <Link href="/digests" className="text-sm text-muted-foreground hover:text-foreground">
          View All →
        </Link>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">No insights yet.</p>
        ) : (
          <ul className="space-y-3">
            {insights.map((i) => (
              <li key={i.id}>
                <Link href="/digests" className="block hover:underline">
                  <span className="font-medium">
                    {i.job_posting?.company?.name ?? "Unknown"} | {i.job_posting?.title}
                  </span>
                  {i.insight_summary && (
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                      {i.insight_summary}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
