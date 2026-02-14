"use client";

import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FunctionBreakdownChart } from "./FunctionBreakdownChart";
import type { RawFunctionData, DonutDataPoint } from "@/lib/dashboard-queries";
import { getCategoryGroup, RoleCategory } from "@/lib/analysis/function-categories";
import { FUNCTION_GROUP_COLORS } from "@/lib/constants";

interface FunctionBreakdownContainerProps {
  rawData: RawFunctionData[];
  companies: { id: string; name: string }[];
}

export function FunctionBreakdownContainer({
  rawData,
  companies,
}: FunctionBreakdownContainerProps) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");

  const donutData: DonutDataPoint[] = useMemo(() => {
    const filteredData =
      selectedCompanyId === "all"
        ? rawData
        : rawData.filter((d) => d.company_id === selectedCompanyId);

    const groupCounts = new Map<string, number>();

    for (const job of filteredData) {
      if (!job.function_category) continue;
      const group = getCategoryGroup(job.function_category as RoleCategory);
      groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
    }

    return Array.from(groupCounts.entries())
      .map(([name, value]) => ({
        name,
        value,
        color:
          FUNCTION_GROUP_COLORS[
            name as keyof typeof FUNCTION_GROUP_COLORS
          ] || FUNCTION_GROUP_COLORS["Other"],
      }))
      .sort((a, b) => b.value - a.value);
  }, [rawData, selectedCompanyId]);

  return (
    <Card className="col-span-1 flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle>Function Mix</CardTitle>
          <CardDescription>Current hiring distribution</CardDescription>
        </div>
        <div className="w-[180px]">
          <Select
            value={selectedCompanyId}
            onValueChange={setSelectedCompanyId}
          >
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
      <CardContent className="flex-1 min-h-0">
        <FunctionBreakdownChart data={donutData} />
      </CardContent>
    </Card>
  );
}
