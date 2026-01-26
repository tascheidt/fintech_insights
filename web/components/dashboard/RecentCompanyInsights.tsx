"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { format } from "date-fns";

interface CompanyInsight {
  id: string;
  generated_at: string;
  executive_summary: string;
  confidence: string;
  company: {
    name: string;
    slug: string;
  };
}

interface RecentCompanyInsightsProps {
  insights: CompanyInsight[];
}

export function RecentCompanyInsights({ insights }: RecentCompanyInsightsProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h2 className="text-lg font-semibold">Recent Company Insights</h2>
        <Link
          href="/digests"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          View All →
        </Link>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No company insights yet. Enable &quot;Track for Strategy&quot; on companies to
            generate weekly insights.
          </p>
        ) : (
          <ul className="space-y-4">
            {insights.map((insight) => (
              <li key={insight.id}>
                <Link
                  href={`/companies/${insight.company.slug}/insights/${insight.id}`}
                  className="block hover:bg-muted/50 -mx-2 px-2 py-2 rounded-lg transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{insight.company.name}</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        insight.confidence === "high"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : insight.confidence === "medium"
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                      }`}
                    >
                      {insight.confidence}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {insight.executive_summary}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(insight.generated_at), "MMM d, yyyy")}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
