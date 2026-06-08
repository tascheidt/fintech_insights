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
import { JobSelectionProvider, useJobSelection } from "@/components/jobs/JobSelectionContext";
import { JobGeneratorModal } from "@/components/jobs/JobGeneratorModal";
import type { JobsListRow } from "@/lib/dashboard-queries";
import { classifyJob } from "@/lib/analysis/role-themes";
import { downloadJobsCsv } from "@/lib/jobs/export-csv";

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
  /** Active company scope, URL-seeded — drives the JobsHeader company control.
   *  Server-filtered (`?company=`), so `rows` already contains only the chosen
   *  company; this just seeds the dropdown's selected value. */
  companyFilter: string;
  /** Active tier scope, URL-seeded — drives the JobsHeader tier control. */
  tierFilter: "fintech" | "incumbent" | "all";
  /** Active activity scope, URL-seeded — drives the JobsHeader status control.
   *  Server-filtered, so `rows` already contains only the chosen set. */
  statusFilter: "active" | "inactive" | "all";
  /** True when the server-side search hit its row cap and older / less-
   *  relevant matches were trimmed. The banner only renders when a query is
   *  actually active — a stale `truncated` from a prior URL has no effect. */
  searchTruncated: boolean;
  /** True when the current rows came from a semantic search and are already
   *  ranked by relevance — the table preserves that order by default. */
  relevanceOrder: boolean;
}

export function JobsPageClient(props: JobsPageClientProps) {
  return (
    <JobSelectionProvider>
      <JobsPageClientInner {...props} />
    </JobSelectionProvider>
  );
}

function JobsPageClientInner({
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
  companyFilter,
  tierFilter,
  statusFilter,
  searchTruncated,
  relevanceOrder,
}: JobsPageClientProps) {
  const [filters, setFilters] = React.useState<JobsFilterState>(initial);
  const { selected, clear } = useJobSelection();
  const [generatorOpen, setGeneratorOpen] = React.useState(false);

  const onChange = React.useCallback((next: JobsFilterState) => {
    setFilters(next);
  }, []);

  // The server already scoped `rows` by search term, tier, status, AND company
  // (the company control drives a `?company=` re-query — so semantic ranking
  // happens within the company rather than client-narrowing the capped result
  // window). The client applies only the remaining axes — function, recency,
  // theme — that can change without a re-fetch.
  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
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
      return true;
    });
  }, [rows, filters, digestContext.themeId]);

  const selectedJobs = React.useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected]
  );

  return (
    <div className="space-y-[14px]">
      <JobsHeader
        companies={companies}
        functionGroups={functionGroups}
        activeCount={activeCount}
        companyCount={companyCount}
        newCount={newCount}
        filteredCount={filtered.length}
        totalCount={rows.length}
        initial={initial}
        digestContext={digestContext}
        companyFilter={companyFilter}
        tierFilter={tierFilter}
        statusFilter={statusFilter}
        onChange={onChange}
        onExportCsv={() => {
          const stem =
            companyFilter !== "all"
              ? `jobs-${companyFilter}`
              : filters.fn !== "all"
                ? `jobs-${filters.fn.toLowerCase().replace(/\s+/g, "-")}`
                : "jobs";
          downloadJobsCsv(filtered, stem);
        }}
      />

      {searchTruncated && filters.q.trim().length > 0 && (
        <div className="rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-[12.5px] text-sand-700">
          {relevanceOrder
            ? "Showing the top 200 closest matches. Refine your search to narrow them."
            : "Showing the 1,000 most recent matches. Refine your search to see older roles."}
        </div>
      )}

      {/* Rail only shows from xl (1280px+). Below that, the table has the
          whole row width — anything narrower forced the title column to
          single-digit pixels because the fixed cols (Company/Function/
          Location/Posted) plus a 280px rail starved everything else. */}
      <div className="grid grid-cols-1 gap-[18px] xl:grid-cols-[1fr_280px] [&>*]:min-w-0">
        <JobsListTable rows={filtered} relevanceOrder={relevanceOrder} />
        <JobsRail heat={heat} themes={themes} />
      </div>

      {/* Floating selection bar */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-sand-200 bg-white px-4 py-2.5 shadow-lg">
            <span className="text-[12.5px] font-medium text-sand-700">
              {selected.size} {selected.size === 1 ? "job" : "jobs"} selected
            </span>
            <div className="h-4 w-px bg-sand-200" />
            <button
              type="button"
              onClick={() => setGeneratorOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-pacific-500 px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-pacific-600"
            >
              Generate posting
            </button>
            <button
              type="button"
              onClick={clear}
              className="text-[12px] text-sand-500 hover:text-sand-700 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <JobGeneratorModal
        open={generatorOpen}
        onOpenChange={setGeneratorOpen}
        selectedJobs={selectedJobs}
      />
    </div>
  );
}
