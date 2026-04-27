/**
 * HiringChart — bar chart of job postings per company.
 *
 * Visual contract:
 * - Bars: `var(--chart-1)` (Pacific 500). Single-series chart.
 * - Tick labels: mono, --muted-foreground.
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

type CompanyCount = { name: string; count: number };

export function HiringChart({ data }: { data: CompanyCount[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[14px] font-semibold">
          Hiring by company (30 days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16 }}>
              <XAxis
                type="number"
                tick={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fill: "var(--muted-foreground)",
                }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={112}
                tick={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  fill: "var(--foreground)",
                }}
                tickLine={false}
                axisLine={false}
              />
              <Bar dataKey="count" fill="var(--chart-1)" radius={[0, 3, 3, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
