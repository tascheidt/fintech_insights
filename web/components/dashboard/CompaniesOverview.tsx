"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { CompanyAvatar } from "@/components/companies/CompanyAvatar";
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

const WINDOW_OPTIONS = [
  { label: "Current", value: "current" },
  { label: "30D", value: "30" },
  { label: "60D", value: "60" },
  { label: "90D", value: "90" },
  { label: "180D", value: "180" },
  { label: "360D", value: "360" },
] as const;

function MatrixControls({
  matrixWindow,
  matrixScope,
}: {
  matrixWindow: string;
  matrixScope: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setParam = (key: string, value: string, defaultValue: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === defaultValue) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    // Reset scope when switching back to current
    if (key === "matrixWindow" && value === "current") {
      params.delete("matrixScope");
    }
    const query = params.toString();
    router.push(query ? `/?${query}` : "/", { scroll: false });
  };

  const isHistorical = matrixWindow !== "current";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Window selector */}
      <div className="inline-flex items-center rounded-lg border bg-muted p-0.5 text-muted-foreground">
        {WINDOW_OPTIONS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setParam("matrixWindow", value, "current")}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-all",
              matrixWindow === value
                ? "bg-background text-foreground shadow-sm"
                : "hover:bg-background/50 hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Scope toggle - only shown for historical windows */}
      {isHistorical && (
        <div className="inline-flex items-center rounded-lg border bg-muted p-0.5 text-muted-foreground">
          <button
            onClick={() => setParam("matrixScope", "active", "active")}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-all",
              matrixScope === "active"
                ? "bg-background text-foreground shadow-sm"
                : "hover:bg-background/50 hover:text-foreground"
            )}
          >
            Open roles
          </button>
          <button
            onClick={() => setParam("matrixScope", "all", "active")}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-all",
              matrixScope === "all"
                ? "bg-background text-foreground shadow-sm"
                : "hover:bg-background/50 hover:text-foreground"
            )}
          >
            All roles
          </button>
        </div>
      )}
    </div>
  );
}

function getDescription(matrixWindow: string, matrixScope: string): string {
  if (matrixWindow === "current") {
    return "Active jobs by company and function group";
  }
  if (matrixScope === "all") {
    return `Roles open at any point during the last ${matrixWindow} days by company and function group`;
  }
  return `Currently open roles by company and function group`;
}

export function CompetitiveMatrix({
  data,
  matrixWindow,
  matrixScope,
  className,
}: {
  data: CompetitiveMatrixRow[];
  matrixWindow: string;
  matrixScope: string;
  className?: string;
}) {
  const isHistorical = matrixWindow !== "current";
  const show7dNet = !isHistorical;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Competitive Matrix</CardTitle>
            <CardDescription>
              {getDescription(matrixWindow, matrixScope)}
            </CardDescription>
          </div>
          <MatrixControls
            matrixWindow={matrixWindow}
            matrixScope={matrixScope}
          />
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No data available yet.
          </p>
        ) : (
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
                    <TableHead className="text-center text-xs">
                      Total
                    </TableHead>
                    {show7dNet && (
                      <TableHead className="text-center text-xs">
                        7d Net
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => (
                    <TableRow
                      key={row.companyId}
                      className={cn(row.total === 0 && "opacity-50")}
                    >
                      <TableCell className="sticky left-0 bg-card z-10">
                        <Link
                          href={`/companies/${row.companySlug}`}
                          className="inline-flex items-center gap-2.5 font-medium text-sm text-foreground"
                        >
                          <CompanyAvatar name={row.companyName} size={22} />
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
                              // Token-driven cell tint: growth for new postings,
                              // sunset for slowdown — never destructive.
                              show7dNet && change > 0 && "bg-primary-soft/40",
                              show7dNet && change < 0 && "bg-accent-soft/40"
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
                        {row.total > 0 ? (
                          row.total
                        ) : (
                          <span className="text-muted-foreground/40">0</span>
                        )}
                      </TableCell>
                      {show7dNet && (
                        <TableCell className="text-center text-xs">
                          <span
                            className={cn(
                              "font-medium tabular-nums",
                              row.weekChange > 0 && "text-growth-500",
                              row.weekChange < 0 && "text-sunset-600",
                              row.weekChange === 0 && "text-muted-foreground"
                            )}
                          >
                            {row.weekChange > 0 ? "+" : ""}
                            {row.weekChange}
                          </span>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CompetitiveMatrix;
