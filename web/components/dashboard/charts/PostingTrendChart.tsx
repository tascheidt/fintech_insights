"use client";

import {
  Area,
  ComposedChart,
  CartesianGrid,
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Net Hiring Flow</CardTitle>
        <CardDescription>
          New vs closed job postings per week
        </CardDescription>
      </CardHeader>
      <CardContent className="pl-2">
        <div className="h-[300px] w-full">
          {data.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              No data available for this time range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient
                    id="colorClosed"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  className="stroke-muted"
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload as NetHiringFlowPoint;
                      return (
                        <div className="rounded-lg border bg-background p-3 shadow-sm text-sm">
                          <p className="font-medium mb-1">Week of {d.label}</p>
                          <div className="space-y-0.5">
                            <p className="text-green-600">+{d.newJobs} new</p>
                            <p className="text-red-500">
                              -{d.closedJobs} closed
                            </p>
                            <p className="font-semibold border-t pt-1 mt-1">
                              Net {d.net >= 0 ? "+" : ""}
                              {d.net}
                            </p>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="newJobs"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorNew)"
                  name="New"
                />
                <Area
                  type="monotone"
                  dataKey="closedJobs"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#colorClosed)"
                  name="Closed"
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="#2563eb"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={false}
                  name="Net"
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
