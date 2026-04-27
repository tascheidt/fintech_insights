"use client";

/**
 * JobsPageClient — thin client wrapper that owns filter state and
 * applies it to the precomputed rows from the server.
 *
 * Renders: JobsHeader (filters) + two-column grid (JobsListTable | JobsRail).
 */

import * as React from "react";
import {
  JobsHeader,
  type JobsFilterState,
} from "@/components/jobs/JobsHeader";
import { JobsListTable } from "@/components/jobs/JobsListTable";
import {
  JobsRail,
  type FunctionHeatRow,
  type CrossCompanyTheme,
} from "@/components/jobs/JobsRail";
import type { JobsListRow } from "@/lib/dashboard-queries";
import { classifyJob } from "@/lib/analysis/role-themes";

export interface JobsPageClientProps {
  rows: JobsListRow[];
  heat: FunctionHeatRow[];
  themes: CrossCompanyTheme[];
  companies: Array<{ slug: string; name: string }>;
  functionGroups: string[];
  initial: JobsFilterState;
  digestContext: {
    themeId: string | null;
    inDigest: string | null;
    fromDate: string | null;
    toDate: string | null;
    companyName: string | null;
  };
  /** Pre-computed eyebrow stats from the server (active + last-7d). */
  activeCount: number;
  newCount: number;
  companyCount: number;
}

export function JobsPageClient({
  rows,
  heat,
  themes,
  companies,
  functionGroups,
  initial,
  digestContext,
  activeCount,
  newCount,
  companyCount,
}: JobsPageClientProps) {
  const [filters, setFilters] = React.useState<JobsFilterState>(initial);

  const onChange = React.useCallback((next: JobsFilterState) => {
    setFilters(next);
  }, []);

  const filtered = React.useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.company !== "all" && r.companySlug !== filters.company) {
        return false;
      }
      if (filters.fn !== "all" && r.functionGroup !== filters.fn) {
        return false;
      }
      if (filters.recency !== "any") {
        const limit = Number(filters.recency);
        if (r.ageDays === null || r.ageDays > limit) return false;
      }
      if (digestContext.themeId) {
        const themes = classifyJob(r.title, r.standardizedDepartment);
        if (!themes.includes(digestContext.themeId)) return false;
      }
      if (q) {
        const hay = [
          r.title,
          r.companyName,
          r.location ?? "",
          r.functionGroup ?? "",
          r.keywords.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters, digestContext.themeId]);

  return (
    <div className="space-y-[14px]">
      <JobsHeader
        companies={companies}
        functionGroups={functionGroups}
        activeCount={activeCount}
        companyCount={companyCount}
        newCount={newCount}
        filteredCount={filtered.length}
        totalCount=
{rows.length}
        initial={initial}
        digestContext={digestContext}
        onChange={onChange}
      />

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1fr_280px]">
        <JobsListTable rows={filtered} />
        <JobsRail heat={heat} themes={themes} />
      </div>
    </div>
  );
}
