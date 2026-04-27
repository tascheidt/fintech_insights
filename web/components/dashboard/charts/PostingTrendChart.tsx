"use client";

/**
 * NetHiringFlowChart — net hiring per week.
 *
 * Visual contract (canonical from `ui_kits/talent_brief/HiringChart.jsx`):
 * - "New" series: Pacific 500 (`var(--chart-1)`).
 * - "Closed" series: Sun 500 (`var(--chart-3)`). Sun (yellow) is the canonical
 *   pairing — NOT Sunset, NOT red. Closed is a slowdown, not an error.
 * - Net line: thin foreground at low opacity, dashed.
 * - Bars (rect), not soft area fills. The whole chart should read quiet,
 *   editorial, financial-newspaper-style — never default-recharts loud.
 * - Axis ticks: mono, --muted-foreground, no axis line.
 * - The destructive token must NEVER be used here.
 */

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { NetHiringFlowPoint } from "@/lib/dashboard-queries";

export function NetHiringFlowChart({
  data,
}: {
  data: NetHiringFlowPoint[];
}) {
  // Recharts expects each row to carry the net for the line series.
  const enriched = data.map((d) => ({ ...d, net: d.newJobs - d.closedJobs }));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-[14px] font-semibold">Net hiring flow</CardTitle>
            <CardDescription className="text-xs">
              New vs closed postings, weekly
            </CardDescription>
          </div>
          <div className="flex items-center gap-4 text-[11.5px] font-medium text-foreground/80">
            <LegendSwatch color="var(--chart-1)" label="New" />
            <LegendSwatch color="var(--chart-3)" label="Closed" />
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span
                aria-hidden
                className="inline-block h-px w-3 border-t border-dashed border-muted-foreground"
              />
              Net
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pl-2">
        {data.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            No data available for this time range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart
              data={enriched}
              margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
              barGap={4}
              barCategoryGap="22%"
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--border)"
              />
              <XAxis
                dataKey="label"
                tick={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fill: "var(--muted-foreground)",
                }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fill: "var(--muted-foreground)",
                }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload as NetHiringFlowPoint & { net: number };
                    return (
                      <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
                        <p className="mb-1 font-medium text-foreground">Week of {d.label}</p>
                        <div className="space-y-0.5 tabular-nums">
                          <p className="text-pacific-700">+{d.newJobs} new</p>
                          <p className="text-sun-800">−{d.closedJobs} closed</p>
                          <p className="mt-1 border-t border-border pt-1 font-semibold text-foreground">
                            Net {d.net >= 0 ? "+" : ""}
                            {d.net}
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              />
              <Bar
                dataKey="newJobs"
                fill="var(--chart-1)"
                radius={[3, 3, 0, 0]}
                name="New"
                maxBarSize={20}
              />
              <Bar
                dataKey="closedJobs"
                fill="var(--chart-3)"
                radius={[3, 3, 0, 0]}
                name="Closed"
                maxBarSize={20}
              />
              <Line
                type="monotone"
                dataKey="net"
                stroke="var(--foreground)"
                strokeOpacity={0.45}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
                name="Net"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-[2px]"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
