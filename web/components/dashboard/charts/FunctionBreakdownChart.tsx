"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FunctionTrend } from "@/lib/dashboard-queries";
import { FUNCTION_GROUP_COLORS } from "@/lib/constants";

export function FunctionBreakdownChart({ data, headless = false }: { data: FunctionTrend[], headless?: boolean }) {
  // Get all unique keys from data except 'date' and 'period' to know which bars to render
  const allKeys = useMemo(() => {
    return data.reduce((keys, item) => {
      Object.keys(item).forEach(key => {
        if (key !== 'date' && key !== 'period' && !keys.includes(key)) {
          keys.push(key);
        }
      });
      return keys;
    }, [] as string[]).sort();
  }, [data]);

  const ChartContent = (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
          <XAxis 
            dataKey="period" 
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
            tickFormatter={(value) => `${value}`}
          />
          <Tooltip
            cursor={{ fill: 'transparent' }}
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                // Calculate total for this period
                const total = payload.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);
                
                return (
                  <div className="rounded-lg border bg-background p-2 shadow-sm">
                    <div className="mb-2 font-bold text-sm flex justify-between gap-4">
                      <span>{label}</span>
                      <span className="text-muted-foreground">Total: {total}</span>
                    </div>
                    {payload.map((entry: any) => (
                      <div key={entry.name} className="flex items-center justify-between gap-4 text-xs">
                        <div className="flex items-center gap-1">
                          <div 
                            className="h-2 w-2 rounded-full" 
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="text-muted-foreground">{entry.name}</span>
                        </div>
                        <span className="font-mono font-medium">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend 
            wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
            iconType="circle"
          />
          {allKeys.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="a"
              fill={FUNCTION_GROUP_COLORS[key as keyof typeof FUNCTION_GROUP_COLORS] || FUNCTION_GROUP_COLORS["Other"]}
              radius={[0, 0, 0, 0]}
              maxBarSize={50}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  if (headless) {
    return ChartContent;
  }

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle>Function Mix</CardTitle>
        <CardDescription>Hiring distribution by function group</CardDescription>
      </CardHeader>
      <CardContent className="pl-2">
        {ChartContent}
      </CardContent>
    </Card>
  );
}
