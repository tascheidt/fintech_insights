"use client";

import { useState, useMemo } from "react";
import { format, parseISO, startOfMonth } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FunctionBreakdownChart } from "./FunctionBreakdownChart";
import { RawFunctionData, FunctionTrend } from "@/lib/dashboard-queries";
import { getCategoryGroup, RoleCategory } from "@/lib/analysis/function-categories";

interface FunctionBreakdownContainerProps {
  rawData: RawFunctionData[];
  companies: { id: string; name: string }[];
}

export function FunctionBreakdownContainer({ rawData, companies }: FunctionBreakdownContainerProps) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");

  const chartData = useMemo(() => {
    // 1. Filter data
    const filteredData = selectedCompanyId === "all"
      ? rawData
      : rawData.filter(d => d.company_id === selectedCompanyId);

    // 2. Aggregate data
    const periodMap = new Map<string, Record<string, number>>();

    filteredData.forEach((job) => {
      if (!job.first_seen_date || !job.function_category) return;

      const date = parseISO(job.first_seen_date);
      // Group by month for cleaner high-level trends
      const periodStart = startOfMonth(date);
      const periodKey = periodStart.toISOString();

      const group = getCategoryGroup(job.function_category as RoleCategory);

      if (!periodMap.has(periodKey)) {
        periodMap.set(periodKey, {});
      }

      const periodCounts = periodMap.get(periodKey)!;
      periodCounts[group] = (periodCounts[group] || 0) + 1;
    });

    // 3. Convert to array
    return Array.from(periodMap.entries())
      .map(([date, counts]) => ({
        date,
        period: format(parseISO(date), "MMM yyyy"),
        ...counts,
      } as FunctionTrend))
      .sort((a, b) => a.date.localeCompare(b.date));

  }, [rawData, selectedCompanyId]);

  return (
    <Card className="col-span-1 flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle>Function Mix</CardTitle>
          <CardDescription>Hiring distribution by function group</CardDescription>
        </div>
        <div className="w-[180px]">
          <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
            <SelectTrigger>
              <SelectValue placeholder="All Companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="pl-2 flex-1 min-h-0">
        {/* Pass data to the chart component, but we need to strip the Card wrapper from the Chart component first 
            OR we can just render the chart content here. 
            Actually, FunctionBreakdownChart renders its own Card. 
            I should modify FunctionBreakdownChart to NOT render a Card, or use composition.
            
            Strategy: I will modify FunctionBreakdownChart to accept a `className` and optionally `hideHeader` prop, 
            or better yet, just extract the chart part. 
            
            For now, I will render the chart component but I need to handle the double Card wrapping.
            Let's modify FunctionBreakdownChart to be a pure chart renderer or make it flexible.
        */}
        <FunctionBreakdownChart data={chartData} headless />
      </CardContent>
    </Card>
  );
}
