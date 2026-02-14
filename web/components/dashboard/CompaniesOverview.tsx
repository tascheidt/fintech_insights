"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CATEGORY_GROUPS } from "@/lib/analysis/function-categories";
import type { CompetitiveMatrixRow } from "@/lib/dashboard-queries";

const DISPLAY_GROUPS = Object.keys(CATEGORY_GROUPS).filter(
  (g) => g !== "Other"
);

const GROUP_SHORT_LABELS: Record<string, string> = {
  Engineering: "Eng",
  "Product & Design": "Prod",
  "Data & Analytics": "Data",
  "Risk, Legal & Compliance": "Risk",
  "Go-To-Market": "GTM",
  "Finance & Strategy": "Fin",
  "Operations & People": "Ops",
};

export function CompetitiveMatrix({
  data,
  className,
}: {
  data: CompetitiveMatrixRow[];
  className?: string;
}) {
  if (data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Competitive Matrix</CardTitle>
          <CardDescription>Active jobs by company and function</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No data available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Competitive Matrix</CardTitle>
        <CardDescription>
          Active jobs by company and function group
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto -mx-6">
          <div className="min-w-[600px] px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card z-10 min-w-[120px]">
                    Company
                  </TableHead>
                  {DISPLAY_GROUPS.map((group) => (
                    <TableHead
                      key={group}
                      className="text-center text-xs whitespace-nowrap px-2"
                    >
                      {GROUP_SHORT_LABELS[group] || group}
                    </TableHead>
                  ))}
                  <TableHead className="text-center text-xs">Total</TableHead>
                  <TableHead className="text-center text-xs">WoW</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.companyId}>
                    <TableCell className="sticky left-0 bg-card z-10">
                      <Link
                        href={`/companies/${row.companySlug}`}
                        className="font-medium text-sm hover:text-primary hover:underline"
                      >
                        {row.companyName}
                      </Link>
                    </TableCell>
                    {DISPLAY_GROUPS.map((group) => {
                      const cell = row.groups[group];
                      const count = cell?.current || 0;
                      const change = cell?.change || 0;
                      return (
                        <TableCell
                          key={group}
                          className={cn(
                            "text-center text-xs tabular-nums px-2",
                            change > 0 && "bg-green-50 dark:bg-green-950/30",
                            change < 0 && "bg-red-50 dark:bg-red-950/30"
                          )}
                        >
                          {count > 0 ? (
                            count
                          ) : (
                            <span className="text-muted-foreground/40">
                              —
                            </span>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center font-semibold text-sm">
                      {row.total}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      <span
                        className={cn(
                          "font-medium",
                          row.weekChange > 0 && "text-green-600",
                          row.weekChange < 0 && "text-red-600",
                          row.weekChange === 0 && "text-muted-foreground"
                        )}
                      >
                        {row.weekChange > 0 ? "+" : ""}
                        {row.weekChange}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CompetitiveMatrix;
