"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { DonutDataPoint } from "@/lib/dashboard-queries";

export function FunctionBreakdownChart({
  data,
}: {
  data: DonutDataPoint[];
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
        No function data available.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[300px]">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload as DonutDataPoint;
                  const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-sm text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: d.color }}
                        />
                        <span className="font-medium">{d.name}</span>
                      </div>
                      <p className="text-muted-foreground mt-0.5">
                        {d.value} jobs ({pct}%)
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2 text-xs px-2">
        {data.map((entry) => (
          <div key={entry.name} className="flex items-center gap-1">
            <div
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="font-mono tabular-nums">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
