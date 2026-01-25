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
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { format, subDays, subMonths } from "date-fns";
import {
  Search,
  Briefcase,
  MapPin,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
} from "lucide-react";
import {
  NotionCard,
  NotionCardContent,
  NotionCardTitle,
  NotionCardDescription,
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
import { getCategoryLabel } from "@/lib/analysis/function-categories";

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
  /** Items per page */
  pageSize?: number;
}

type StatusFilter = "all" | "active" | "inactive";
type TimeFilter = "all" | "7days" | "30days" | "90days" | "6months" | "1year";

/**
 * Main JobHistoryView component
 */
export function JobHistoryView({
  jobs,
  companySlug,
  className,
  showHeader = true,
  initialStatus = "all",
  pageSize = 12,
}: JobHistoryViewProps) {
  const [view, setView] = useViewPreference(`jobs-${companySlug}`, "table");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>(initialStatus);
  const [timeFilter, setTimeFilter] = React.useState<TimeFilter>("all");
  const [companyFilter, setCompanyFilter] = React.useState<string>("all");
  const [currentPage, setCurrentPage] = React.useState(1);

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

  // Filter jobs based on current filters
  const filteredJobs = React.useMemo(() => {
    let result = [...jobs];

    // Company filter (only when viewing all companies)
    if (companySlug === "all" && companyFilter !== "all") {
      result = result.filter((j) => j.companySlug === companyFilter);
    }

    // Status filter
    if (statusFilter === "active") {
      result = result.filter((j) => j.isActive);
    } else if (statusFilter === "inactive") {
      result = result.filter((j) => !j.isActive);
    }

    // Time filter
    if (timeFilter !== "all") {
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

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (j) =>
          j.title.toLowerCase().includes(query) ||
          j.standardized_department?.toLowerCase().includes(query) ||
          j.function_category?.toLowerCase().includes(query) ||
          (j.function_category && getCategoryLabel(j.function_category as any).toLowerCase().includes(query)) ||
          j.location?.toLowerCase().includes(query) ||
          j.companyName?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [jobs, companySlug, companyFilter, statusFilter, timeFilter, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredJobs.length / pageSize);
  const paginatedJobs = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [filteredJobs, currentPage, pageSize]);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, timeFilter, companyFilter, searchQuery]);

  const hasFilters = 
    statusFilter !== "all" || 
    timeFilter !== "all" || 
    (companySlug === "all" && companyFilter !== "all") ||
    searchQuery.trim();

  const clearFilters = () => {
    setStatusFilter("all");
    setTimeFilter("all");
    setCompanyFilter("all");
    setSearchQuery("");
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Job Postings</h2>
            <p className="text-sm text-muted-foreground">
              {filteredJobs.length} of {jobs.length} jobs
            </p>
          </div>
          <ViewToggle view={view} onViewChange={setView} />
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
        <JobsCardView jobs={paginatedJobs} />
      ) : (
        <JobsTableView jobs={paginatedJobs} />
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
 * Card view for jobs
 */
function JobsCardView({ jobs }: { jobs: JobData[] }) {
  const hasCompanyInfo = jobs.some((j) => j.companyName);
  const router = useRouter();
  
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {jobs.map((job) => (
        <Link key={job.id} href={`/jobs/${job.id}`}>
          <NotionCard className="h-full">
            <NotionCardContent>
              {/* Title and status */}
              <div className="flex items-start justify-between gap-2">
                <NotionCardTitle className="flex-1">{job.title}</NotionCardTitle>
                <span
                  className={cn(
                    "shrink-0 w-2 h-2 rounded-full mt-1.5",
                    job.isActive ? "bg-green-500" : "bg-gray-400"
                  )}
                  title={job.isActive ? "Active" : "Inactive"}
                />
              </div>

              {/* Company (if available) */}
              {hasCompanyInfo && job.companyName && (
                <div className="mt-2">
                  {job.companySlug ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push(`/companies/${job.companySlug}`);
                      }}
                      className="text-xs text-primary hover:underline font-medium text-left"
                    >
                      {job.companyName}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">{job.companyName}</span>
                  )}
                </div>
              )}

              {/* Details */}
              <div className="space-y-1 mt-3">
                {job.standardized_department && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Briefcase className="h-3 w-3" />
                    <span>{job.standardized_department}</span>
                  </div>
                )}
                {job.function_category && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Briefcase className="h-3 w-3" />
                    <span>{getCategoryLabel(job.function_category as any)}</span>
                  </div>
                )}
                {job.location && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>{job.location}</span>
                  </div>
                )}
                {job.firstSeenDate && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>{format(new Date(job.firstSeenDate), "MMM d, yyyy")}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <NotionCardFooter className="mt-auto pt-3">
                <NotionCardTag className={job.isActive 
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                }>
                  {job.isActive ? "Active" : "Closed"}
                </NotionCardTag>
              </NotionCardFooter>
            </NotionCardContent>
          </NotionCard>
        </Link>
      ))}
    </div>
  );
}

/**
 * Table view for jobs
 */
function JobsTableView({ jobs }: { jobs: JobData[] }) {
  const hasCompanyInfo = jobs.some((j) => j.companyName);
  
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            {hasCompanyInfo && (
              <TableHead className="hidden sm:table-cell">Company</TableHead>
            )}
            <TableHead className="hidden sm:table-cell">Department</TableHead>
            <TableHead className="hidden sm:table-cell">Function</TableHead>
            <TableHead className="hidden md:table-cell">Location</TableHead>
            <TableHead className="hidden md:table-cell">First Seen</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="font-medium">{job.title}</TableCell>
              {hasCompanyInfo && (
                <TableCell className="hidden sm:table-cell">
                  {job.companySlug ? (
                    <Link
                      href={`/companies/${job.companySlug}`}
                      className="text-primary hover:underline"
                    >
                      {job.companyName ?? "—"}
                    </Link>
                  ) : (
                    job.companyName ?? "—"
                  )}
                </TableCell>
              )}
              <TableCell className="hidden sm:table-cell">{job.standardized_department ?? "—"}</TableCell>
              <TableCell className="hidden sm:table-cell">
                {job.function_category ? getCategoryLabel(job.function_category as any) : "—"}
              </TableCell>
              <TableCell className="hidden md:table-cell">{job.location ?? "—"}</TableCell>
              <TableCell className="hidden md:table-cell">
                {job.firstSeenDate
                  ? format(new Date(job.firstSeenDate), "MMM d, yyyy")
                  : "—"}
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                    job.isActive
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  )}
                >
                  {job.isActive ? "Active" : "Closed"}
                </span>
              </TableCell>
              <TableCell>
                <Link
                  href={`/jobs/${job.id}`}
                  className="text-primary text-sm hover:underline"
                >
                  View →
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default JobHistoryView;
