"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface FunctionStat {
  category: string;
  label: string;
  group: string;
  count: number;
  percentage: number;
}

interface FunctionBreakdownProps {
  functions: FunctionStat[];
}

// Function-category palette — token-driven (see globals.css `--cat-*` family)
// and FUNCTION_GROUP_COLORS in lib/constants.ts.
const GROUP_COLORS: Record<string, string> = {
  Engineering: "bg-cat-engineering",
  "Product & Design": "bg-cat-product",
  "Data & Analytics": "bg-cat-data",
  "Risk, Legal & Compliance": "bg-cat-risk",
  "Go-To-Market": "bg-cat-gtm",
  "Finance & Strategy": "bg-cat-finance",
  "Operations & People": "bg-cat-operations",
  Other: "bg-cat-other",
};

export function FunctionBreakdown({ functions }: FunctionBreakdownProps) {
  // Group functions by category group
  const groups = new Map<string, FunctionStat[]>();
  for (const func of functions) {
    const group = func.group || "Other";
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push(func);
  }

  // Calculate group totals
  const groupTotals = Array.from(groups.entries())
    .map(([group, funcs]) => ({
      group,
      count: funcs.reduce((sum, f) => sum + f.count, 0),
      percentage: funcs.reduce((sum, f) => sum + f.percentage, 0),
      functions: funcs.sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count);

  const totalJobs = functions.reduce((sum, f) => sum + f.count, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold">Hiring by Function</h2>
            <p className="text-sm text-muted-foreground">
              {totalJobs} total job postings analyzed
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Bar Chart */}
        <div className="space-y-3">
          {groupTotals.map(({ group, count, percentage }) => (
            <div key={group} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{group}</span>
                <span className="text-muted-foreground">
                  {count} ({percentage}%)
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full ${GROUP_COLORS[group] || "bg-gray-500"} transition-all`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Detailed Breakdown */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-4 border-t">
          {groupTotals.map(({ group, functions: groupFunctions }) => (
            <div key={group}>
              <h3 className="font-medium mb-2 flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full ${GROUP_COLORS[group] || "bg-gray-500"}`}
                />
                {group}
              </h3>
              <ul className="space-y-1 text-sm">
                {groupFunctions.slice(0, 5).map((func) => (
                  <li
                    key={func.category}
                    className="flex items-center justify-between text-muted-foreground"
                  >
                    <span>{func.label}</span>
                    <span>{func.count}</span>
                  </li>
                ))}
                {groupFunctions.length > 5 && (
                  <li className="text-xs text-muted-foreground">
                    +{groupFunctions.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
