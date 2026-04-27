"use client";

/**
 * JobHistoryView - Displays job postings with Notion-style card/table toggle and filters.
 * 
 * Features:
 * - Card and table view toggle
 * - Filters: active/inactive, time period, keyword search
 * - Pagination support
 * - Links to job detail pages
 */

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { format, subDays, subMonths } from "date-fns";
import {
  Search,
  MapPin,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
} from "lucide-react";
import {
  NotionCard,
  NotionCardContent,
  NotionCardTitle,
  NotionCardFooter,
  NotionCardTag,
} from "@/components/ui/notion-card";
import { ViewToggle, useViewPreference } from "@/components/ui/view-toggle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { getCategoryLabel, getCategoryGroup, ROLE_CATEGORIES, type RoleCategory } from "@/lib/analysis/function-categories";
import { classifyJob, getThemeLabel } from "@/lib/analysis/role-themes";
import { CompanyAvatar } from "@/components/companies/CompanyAvatar";

/** Job posting data structure */
export interface JobData {
  id: string;
  title: string;
  standardized_department: string | null; // Use standardized_department, never raw department
  function_category: string | null; // Function category (role specialization)
  location: string | null;
  isActive: boolean;
  firstSeenDate: string | null;
  url: string | null;
  companyName?: string;
  companySlug?: string;
}

interface JobHistoryViewProps {
  jobs: JobData[];
  companySlug: string;
  className?: string;
  /** Show title and description */
  showHeader?: boolean;
  /** Initial status filter */
  initialStatus?: "all" | "active" | "inactive";
  /** Initial time filter */
  initialTimeFilter?: TimeFilter;
  /**
   * Initial role theme filter (from URL). Not exposed as a dropdown —
   * URL-driven only, surfaced to the user via the digest context banner.
   */
  initialThemeFilter?: string | null;
  /** Initial company filter (company slug, or null). Seeds the existing dropdown. */
  initialCompanyFilter?: string | null;
  /**
   * When set, indicates the page was entered from a weekly digest with this
   * digest UUID. Used by the context banner to read "from this digest".
   */
  initialInDigest?: string | null;
  /** Initial from-date filter (ISO string) applied to first_seen_date. */
  initialFromDate?: string | null;
  /** Initial to-date filter (ISO string) applied to first_seen_date. */
  initialToDate?: string | null;
  /** Items per page */
  pageSize?: number;
}

type StatusFilter = "all" | "active" | "inactive";
type TimeFilter = "all" | "7days" | "30days" | "90days" | "6months" | "1year";

function isRoleCategory(value: string | null): value is RoleCategory {
  return value !== null && ROLE_CATEGORIES.includes(value as RoleCategory);
}

/**
 * Main JobHistoryView component
 */
export function JobHistoryView({
  jobs,
  companySlug,
  className,
  showHeader = true,
  initialStatus = "all",
  initialTimeFilter = "all",
  initialThemeFilter = null,
  initialCompanyFilter = null,
  initialInDigest = null,
  initialFromDate = null,
  initialToDate = null,
  pageSize = 12,
}: JobHistoryViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useViewPreference(`jobs-${companySlug}`, "table");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>(initialStatus);
  const [timeFilter, setTimeFilter] = React.useState<TimeFilter>(initialTimeFilter);
  const [companyFilter, setCompanyFilter] = React.useState<string>(
    initialCompanyFilter ?? "all"
  );
  const [functionFilter, setFunctionFilter] = React.useState<string>(() => {
    return searchParams.get("function") ?? "all";
  });
  const [themeFilter, setThemeFilter] = React.useState<string | null>(
    initialThemeFilter
  );
  const [fromDateFilter, setFromDateFilter] = React.useState<string | null>(
    initialFromDate
  );
  const [toDateFilter, setToDateFilter] = React.useState<string | null>(
    initialToDate
  );
  const [inDigestFilter, setInDigestFilter] = React.useState<string | null>(
    initialInDigest
  );
  const [currentPage, setCurrentPage] = React.useState(1);

  // Sync function filter to URL
  const updateFunctionFilter = React.useCallback((value: string) => {
    setFunctionFilter(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("function");
    } else {
      params.set("function", value);
    }
    const query = params.toString();
    router.replace(query ? `?${query}` : window.location.pathname, { scroll: false });
  }, [router, searchParams]);

  // Extract unique companies for filter (only when viewing all companies)
  const availableCompanies = React.useMemo(() => {
    if (companySlug !== "all") return [];
    const companies = new Map<string, { slug: string; name: string }>();
    jobs.forEach((job) => {
      if (job.companySlug && job.companyName) {
        companies.set(job.companySlug, {
          slug: job.companySlug,
          name: job.companyName,
        });
      }
    });
    return Array.from(companies.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [jobs, companySlug]);

  // Extract unique function groups from job data for the dropdown
  const availableFunctionGroups = React.useMemo(() => {
    const groups = new Set<string>();
    jobs.forEach((job) => {
      if (job.function_category && ROLE_CATEGORIES.includes(job.function_category as RoleCategory)) {
        groups.add(getCategoryGroup(job.function_category as RoleCategory));
      }
    });
    return Array.from(groups).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  // Filter jobs based on current filters
  const filteredJobs = React.useMemo(() => {
    let result = [...jobs];

    // Company filter (only when viewing all companies)
    if (companySlug === "all" && companyFilter !== "all") {
      result = result.filter((j) => j.companySlug === companyFilter);
    }

    // Function filter
    if (functionFilter !== "all") {
      result = result.filter((j) => {
        if (!j.function_category || !ROLE_CATEGORIES.includes(j.function_category as RoleCategory)) {
          return false;
        }
        return getCategoryGroup(j.function_category as RoleCategory) === functionFilter;
      });
    }

    // Status filter
    if (statusFilter === "active") {
      result = result.filter((j) => j.isActive);
    } else if (statusFilter === "inactive") {
      result = result.filter((j) => !j.isActive);
    }

    // Time filter — from/to overrides the preset (mutually exclusive).
    if (fromDateFilter || toDateFilter) {
      const fromCutoff = fromDateFilter ? new Date(fromDateFilter) : null;
      const toCutoff = toDateFilter ? new Date(toDateFilter) : null;
      result = result.filter((j) => {
        if (!j.firstSeenDate) return false;
        const seen = new Date(j.firstSeenDate);
        if (fromCutoff && seen < fromCutoff) return false;
        if (toCutoff && seen > toCutoff) return false;
        return true;
      });
    } else if (timeFilter !== "all") {
      const now = new Date();
      let cutoffDate: Date;

      switch (timeFilter) {
        case "7days":
          cutoffDate = subDays(now, 7);
          break;
        case "30days":
          cutoffDate = subDays(now, 30);
          break;
        case "90days":
          cutoffDate = subDays(now, 90);
          break;
        case "6months":
          cutoffDate = subMonths(now, 6);
          break;
        case "1year":
          cutoffDate = subMonths(now, 12);
          break;
        default:
          cutoffDate = new Date(0);
      }

      result = result.filter((j) => {
        if (!j.firstSeenDate) return false;
        return new Date(j.firstSeenDate) >= cutoffDate;
      });
    }

    // Role theme filter (URL-driven, from digest deep links). Uses the
    // shared classifier from @/lib/analysis/role-themes — no theme tags are
    // persisted on job rows.
    if (themeFilter) {
      result = result.filter((j) =>
        classifyJob(j.title, j.standardized_department).includes(themeFilter)
      );
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (j) =>
          j.title.toLowerCase().includes(query) ||
          j.standardized_department?.toLowerCase().includes(query) ||
          j.function_category?.toLowerCase().includes(query) ||
          (isRoleCategory(j.function_category) &&
            getCategoryLabel(j.function_category).toLowerCase().includes(query)) ||
          j.location?.toLowerCase().includes(query) ||
          j.companyName?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [
    jobs,
    companySlug,
    companyFilter,
    functionFilter,
    statusFilter,
    timeFilter,
    searchQuery,
    themeFilter,
    fromDateFilter,
    toDateFilter,
  ]);

  // Pagination
  const totalPages = Math.ceil(filteredJobs.length / pageSize);
  const paginatedJobs = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [filteredJobs, currentPage, pageSize]);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [
    statusFilter,
    timeFilter,
    companyFilter,
    functionFilter,
    searchQuery,
    themeFilter,
    fromDateFilter,
    toDateFilter,
  ]);

  const hasDigestContext =
    Boolean(themeFilter) ||
    Boolean(inDigestFilter) ||
    Boolean(fromDateFilter) ||
    Boolean(toDateFilter) ||
    (companySlug === "all" && Boolean(initialCompanyFilter));

  const hasFilters =
    statusFilter !== "all" ||
    timeFilter !== "all" ||
    functionFilter !== "all" ||
    (companySlug === "all" && companyFilter !== "all") ||
    Boolean(themeFilter) ||
    Boolean(fromDateFilter) ||
    Boolean(toDateFilter) ||
    Boolean(inDigestFilter) ||
    searchQuery.trim();

  const clearFilters = () => {
    setStatusFilter("all");
    setTimeFilter("all");
    setCompanyFilter("all");
    updateFunctionFilter("all");
    setSearchQuery("");
    setThemeFilter(null);
    setFromDateFilter(null);
    setToDateFilter(null);
    setInDigestFilter(null);
    // Reset URL-level params introduced for digest deep links by navigating
    // to the bare /jobs page.
    if (hasDigestContext) {
      router.push("/jobs");
    }
  };

  // Derive the display name for the active company filter (for the banner).
  // We prefer the slug currently held in companyFilter over the initial prop
  // so that the banner stays accurate if the user changes it via the
  // dropdown before clearing digest context.
  const activeCompanyName = React.useMemo(() => {
    const slug =
      companySlug === "all" && companyFilter !== "all"
        ? companyFilter
        : initialCompanyFilter;
    if (!slug) return null;
    const match = jobs.find((j) => j.companySlug === slug);
    return match?.companyName ?? slug;
  }, [jobs, initialCompanyFilter, companyFilter, companySlug]);

  // Build the descriptive context-banner sentence. Fragments are assembled in
  // a deterministic order so the resulting sentence reads naturally no
  // matter which subset of filters is active:
  //   "Viewing {Company}'s jobs in {Theme}, from this digest"
  //   "Viewing jobs in {Theme}, between {from} and {to}"
  const contextBannerFragments = React.useMemo(() => {
    const parts: React.ReactNode[] = [];
    if (activeCompanyName) {
      parts.push(
        <>
          <span className="font-semibold text-foreground">
            {activeCompanyName}
          </span>
          &rsquo;s jobs
        </>
      );
    } else {
      parts.push(<>jobs</>);
    }

    if (themeFilter) {
      parts.push(
        <>
          {" "}in{" "}
          <span className="font-semibold text-foreground">
            {getThemeLabel(themeFilter)}
          </span>
        </>
      );
    }

    if (inDigestFilter) {
      parts.push(<>, from this digest</>);
    } else if (fromDateFilter || toDateFilter) {
      const fromLabel = fromDateFilter
        ? format(new Date(fromDateFilter), "MMM d")
        : null;
      const toLabel = toDateFilter
        ? format(new Date(toDateFilter), "MMM d, yyyy")
        : null;
      if (fromLabel && toLabel) {
        parts.push(
          <>
            , between {fromLabel} and {toLabel}
          </>
        );
      } else if (fromLabel) {
        parts.push(<>, from {fromLabel} onward</>);
      } else if (toLabel) {
        parts.push(<>, through {toLabel}</>);
      }
    }

    return parts;
  }, [
    activeCompanyName,
    themeFilter,
    inDigestFilter,
    fromDateFilter,
    toDateFilter,
  ]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header — eyebrow + count, no redundant title (the page already titled this section) */}
      {showHeader && (
        <div className="flex items-end justify-between border-b border-border pb-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground tabular-nums">
            {filteredJobs.length} of {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
          </p>
          <ViewToggle view={view} onViewChange={setView} />
        </div>
      )}

      {/* Digest context banner — shown when the user lands on /jobs from a
          weekly-digest deep link with any of theme / company / inDigest /
          from / to active. This is the orientation cue that makes arriving
          from an email feel intentional instead of mysterious. */}
      {hasDigestContext && (
        <div className="rounded-lg border bg-muted/40 px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              <div>
                Viewing{" "}
                {contextBannerFragments.map((fragment, idx) => (
                  <React.Fragment key={idx}>{fragment}</React.Fragment>
                ))}
              </div>
              <div className="mt-1 text-xs">
                {filteredJobs.length} of {jobs.length}{" "}
                {jobs.length === 1 ? "job" : "jobs"} match
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="shrink-0"
            >
              Clear filters
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Company filter (only when viewing all companies) */}
        {companySlug === "all" && availableCompanies.length > 0 && (
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-full sm:w-[160px] min-h-[44px]">
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {availableCompanies.map((company) => (
                <SelectItem key={company.slug} value={company.slug}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-full sm:w-[140px] min-h-[44px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        {/* Time filter */}
        <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
          <SelectTrigger className="w-full sm:w-[140px] min-h-[44px]">
            <SelectValue placeholder="Time" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="7days">Last 7 Days</SelectItem>
            <SelectItem value="30days">Last 30 Days</SelectItem>
            <SelectItem value="90days">Last 90 Days</SelectItem>
            <SelectItem value="6months">Last 6 Months</SelectItem>
            <SelectItem value="1year">Last Year</SelectItem>
          </SelectContent>
        </Select>

        {/* Function filter */}
        {availableFunctionGroups.length > 0 && (
          <Select value={functionFilter} onValueChange={updateFunctionFilter}>
            <SelectTrigger className="w-full sm:w-[180px] min-h-[44px]">
              <SelectValue placeholder="Function" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Functions</SelectItem>
              {availableFunctionGroups.map((group) => (
                <SelectItem key={group} value={group}>
                  {group}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Clear filters */}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}

        {/* View toggle (if no header) */}
        {!showHeader && <ViewToggle view={view} onViewChange={setView} />}
      </div>

      {/* Content */}
      {filteredJobs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Filter className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {hasFilters
              ? "No jobs match your filters. Try adjusting your search."
              : "No job postings found."}
          </p>
        </div>
      ) : view === "card" ? (
        <JobsCardView jobs={paginatedJobs} source={companySlug === "all" ? "jobs" : "company"} />
      ) : (
        <JobsTableView jobs={paginatedJobs} source={companySlug === "all" ? "jobs" : "company"} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Hot functions — these get the highlight chip (sunset-soft) instead of
 * the neutral muted chip. Compliance & Payments are the canonical "hot"
 * categories per CORRECTIONS.md § 3.
 */
const HOT_FUNCTION_GROUPS = new Set([
  "Risk, Legal & Compliance",
  "Engineering", // Payments often nests under Eng
]);

/** Compact "2d ago" / "Mar 14" first-seen formatter. */
function formatFirstSeen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  return format(d, "MMM d");
}

/** "5700 Yonge St, North York, ON M2N 5M9, Canada" → "North York, Canada". */
function shortLocation(loc: string | null): string {
  if (!loc) return "—";
  const parts = loc.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join(", ");
  // Heuristic: drop street address (usually the first segment), keep last city + country.
  const country = parts[parts.length - 1];
  // Find the first segment that looks like a city name (no digits).
  const city = parts.find((p) => !/\d/.test(p)) ?? parts[0];
  if (city === country) return city;
  return `${city}, ${country}`;
}

/**
 * Card view for jobs.
 *
 * Visual contract: company avatar + plain title (foreground, no link styling),
 * function chip, truncated location, mono first-seen, status chip.
 */
function JobsCardView({ jobs, source }: { jobs: JobData[]; source: string }) {
  const hasCompanyInfo = jobs.some((j) => j.companyName);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {jobs.map((job) => {
        const isHot =
          isRoleCategory(job.function_category) &&
          HOT_FUNCTION_GROUPS.has(getCategoryGroup(job.function_category as RoleCategory));
        return (
          <Link key={job.id} href={`/jobs/${job.id}?source=${source}`}>
            <NotionCard className="h-full">
              <NotionCardContent>
                <div className="flex items-start justify-between gap-2">
                  <NotionCardTitle className="flex-1 text-foreground">
                    {job.title}
                  </NotionCardTitle>
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      job.isActive ? "bg-pacific-500" : "bg-sand-400"
                    )}
                    title={job.isActive ? "Active" : "Inactive"}
                  />
                </div>

                {hasCompanyInfo && job.companyName && (
                  <div className="mt-2 flex items-center gap-2">
                    <CompanyAvatar name={job.companyName} size={20} />
                    <span className="text-xs font-medium text-muted-foreground">
                      {job.companyName}
                    </span>
                  </div>
                )}

                <div className="mt-3 space-y-1.5">
                  {job.function_category && (
                    <span
                      className={cn(
                        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        isHot
                          ? "bg-highlight-soft text-highlight-soft-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {isRoleCategory(job.function_category)
                        ? getCategoryLabel(job.function_category)
                        : job.function_category}
                    </span>
                  )}
                  {job.location && (
                    <div
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                      title={job.location}
                    >
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{shortLocation(job.location)}</span>
                    </div>
                  )}
                  {job.firstSeenDate && (
                    <div className="flex items-center gap-1.5 font-mono text-[11.5px] tabular-nums text-muted-foreground">
                      <Calendar className="h-3 w-3 shrink-0" />
                      {formatFirstSeen(job.firstSeenDate)}
                    </div>
                  )}
                </div>

                <NotionCardFooter className="mt-auto pt-3">
                  <NotionCardTag
                    className={
                      job.isActive
                        ? "bg-accent-soft text-accent-soft-foreground"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {job.isActive ? "Active" : "Closed"}
                  </NotionCardTag>
                </NotionCardFooter>
              </NotionCardContent>
            </NotionCard>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Table view for jobs (canonical Talent Brief table layout).
 *
 * Visual contract per CORRECTIONS.md § 3:
 * - Title in `--foreground`, medium weight, NO underline (underline on row hover).
 * - The whole ROW is the link target — not the title text.
 * - Company column: 22×22 avatar + name in muted-foreground (no blue links).
 * - Function: chip (bg-muted for default, bg-highlight-soft for hot).
 * - Location: truncated City, Country (full in title attribute).
 * - First seen: mono tabular-nums, "2d ago" then date.
 * - Status: accent-soft for active, muted for closed.
 */
function JobsTableView({ jobs, source }: { jobs: JobData[]; source: string }) {
  const router = useRouter();
  const hasCompanyInfo = jobs.some((j) => j.companyName);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
            <TableHead className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Title
            </TableHead>
            {hasCompanyInfo && (
              <TableHead className="hidden font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground sm:table-cell">
                Company
              </TableHead>
            )}
            <TableHead className="hidden font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground sm:table-cell">
              Function
            </TableHead>
            <TableHead className="hidden font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground md:table-cell">
              Location
            </TableHead>
            <TableHead className="hidden font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground md:table-cell">
              First seen
            </TableHead>
            <TableHead className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => {
            const isHot =
              isRoleCategory(job.function_category) &&
              HOT_FUNCTION_GROUPS.has(getCategoryGroup(job.function_category as RoleCategory));
            return (
              <TableRow
                key={job.id}
                className="cursor-pointer border-b border-border transition-colors hover:bg-secondary"
                onClick={() => router.push(`/jobs/${job.id}?source=${source}`)}
              >
                <TableCell className="text-[13px] font-medium text-foreground">
                  {job.title}
                </TableCell>
                {hasCompanyInfo && (
                  <TableCell className="hidden text-[13px] sm:table-cell">
                    <span className="inline-flex items-center gap-2">
                      <CompanyAvatar name={job.companyName} size={22} />
                      <span className="text-muted-foreground">
                        {job.companyName ?? "—"}
                      </span>
                    </span>
                  </TableCell>
                )}
                <TableCell className="hidden sm:table-cell">
                  {job.function_category ? (
                    <span
                      className={cn(
                        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        isHot
                          ? "bg-highlight-soft text-highlight-soft-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {isRoleCategory(job.function_category)
                        ? getCategoryLabel(job.function_category)
                        : job.function_category}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell
                  className="hidden max-w-[200px] truncate text-[13px] text-muted-foreground md:table-cell"
                  title={job.location ?? undefined}
                >
                  {shortLocation(job.location)}
                </TableCell>
                <TableCell className="hidden font-mono text-[12px] tabular-nums text-muted-foreground md:table-cell">
                  {formatFirstSeen(job.firstSeenDate)}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                      job.isActive
                        ? "bg-accent-soft text-accent-soft-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {job.isActive ? "Active" : "Closed"}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default JobHistoryView;
