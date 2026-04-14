/**
 * Jobs Page
 *
 * Shows all job postings across all companies with search and filters.
 * Uses the same JobHistoryView component as company pages.
 *
 * Accepts query parameters so that deep links from the weekly digest email
 * can land users in a pre-filtered view with a context banner for
 * orientation. Supported params:
 *   - status, time, date (legacy)
 *   - theme (role theme id)
 *   - company (company slug)
 *   - inDigest (weekly_digests UUID — scopes to the digest's captured jobs)
 *   - from, to (ISO date strings)
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JobHistoryView, JobData } from "@/components/companies/JobHistoryView";

type JobsPageSearchParams = {
  status?: string;
  time?: string;
  date?: string;
  theme?: string;
  company?: string;
  inDigest?: string;
  from?: string;
  to?: string;
};

type JobRow = {
  id: string;
  title: string;
  standardized_department: string | null;
  function_category: string | null;
  location: string | null;
  is_active: boolean;
  first_seen_date: string | null;
  url: string | null;
  companies:
    | { id: string; name: string; slug: string }
    | { id: string; name: string; slug: string }[]
    | null;
};

type DigestCompanyRow = {
  company_id: string;
  job_ids: unknown;
};

function getInitialStatus(status?: string): "all" | "active" | "inactive" {
  if (status === "active" || status === "inactive") return status;
  return "all";
}

function getInitialTimeFilter(
  time?: string,
  date?: string
): "all" | "7days" | "30days" | "90days" | "6months" | "1year" {
  const requestedFilter = time ?? (date === "week" ? "7days" : undefined);
  if (
    requestedFilter === "7days" ||
    requestedFilter === "30days" ||
    requestedFilter === "90days" ||
    requestedFilter === "6months" ||
    requestedFilter === "1year"
  ) {
    return requestedFilter;
  }

  return "all";
}

/** Parse an ISO date param and return the normalized string, or null if invalid. */
function parseIsoDateParam(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return value;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<JobsPageSearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const themeParam = params.theme?.trim() || null;
  const companyParam = params.company?.trim() || null;
  const inDigestParam = params.inDigest?.trim() || null;
  const fromParam = parseIsoDateParam(params.from);
  const toParam = parseIsoDateParam(params.to);

  // When viewing a digest snapshot, the job_ids list is already the scope —
  // we must show closed jobs as well because the digest is a historical
  // frame, so force status to "all" regardless of the incoming status param.
  const initialStatus = inDigestParam
    ? "all"
    : getInitialStatus(params.status);

  // Explicit from/to overrides the preset time filter (mutually exclusive).
  const initialTimeFilter =
    fromParam || toParam
      ? "all"
      : getInitialTimeFilter(params.time, params.date);

  // If inDigest is present, look up the job_ids captured by that digest (or
  // the single matching company's job_ids if company is also set).
  let digestJobIds: string[] | null = null;
  if (inDigestParam) {
    let companyId: string | null = null;
    if (companyParam) {
      const { data: companyRow } = await supabase
        .from("companies")
        .select("id")
        .eq("slug", companyParam)
        .maybeSingle();
      companyId = companyRow?.id ?? null;
    }

    let digestCompaniesQuery = supabase
      .from("weekly_digest_companies")
      .select("company_id, job_ids")
      .eq("digest_id", inDigestParam);

    if (companyParam && companyId) {
      digestCompaniesQuery = digestCompaniesQuery.eq("company_id", companyId);
    }

    const { data: digestCompanyRows } = await digestCompaniesQuery;

    const jobIdSet = new Set<string>();
    for (const row of (digestCompanyRows ?? []) as DigestCompanyRow[]) {
      const rawIds = Array.isArray(row.job_ids) ? row.job_ids : [];
      for (const id of rawIds) {
        if (typeof id === "string" && id) jobIdSet.add(id);
      }
    }
    digestJobIds = Array.from(jobIdSet);
  }

  // Fetch all jobs with company information
  let jobsQuery = supabase
    .from("job_postings")
    .select(
      "id, title, standardized_department, function_category, location, is_active, first_seen_date, url, companies(id, name, slug)"
    )
    .order("first_seen_date", { ascending: false });

  if (digestJobIds !== null) {
    if (digestJobIds.length === 0) {
      // Digest exists but captured nothing (or doesn't exist). Short-circuit
      // to an empty list — the banner will still render and show 0 of 0.
      const emptyJobs: JobData[] = [];
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">All Jobs</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browse job postings across all companies
            </p>
          </div>
          <JobHistoryView
            jobs={emptyJobs}
            companySlug="all"
            initialStatus={initialStatus}
            initialTimeFilter={initialTimeFilter}
            initialThemeFilter={themeParam}
            initialCompanyFilter={companyParam}
            initialInDigest={inDigestParam}
            initialFromDate={fromParam}
            initialToDate={toParam}
            showHeader={true}
            pageSize={24}
          />
        </div>
      );
    }
    jobsQuery = jobsQuery.in("id", digestJobIds);
  }

  const { data: jobsRaw } = await jobsQuery;

  // Transform jobs data for JobHistoryView
  const jobs: JobData[] = ((jobsRaw ?? []) as JobRow[]).map((j) => {
    const company = Array.isArray(j.companies) ? j.companies[0] : j.companies;
    return {
      id: j.id,
      title: j.title,
      standardized_department: j.standardized_department,
      function_category: j.function_category,
      location: j.location,
      isActive: j.is_active,
      firstSeenDate: j.first_seen_date,
      url: j.url,
      companyName: company?.name,
      companySlug: company?.slug,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">All Jobs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse job postings across all companies
        </p>
      </div>
      <JobHistoryView
        jobs={jobs}
        companySlug="all"
        initialStatus={initialStatus}
        initialTimeFilter={initialTimeFilter}
        initialThemeFilter={themeParam}
        initialCompanyFilter={companyParam}
        initialInDigest={inDigestParam}
        initialFromDate={fromParam}
        initialToDate={toParam}
        showHeader={true}
        pageSize={24}
      />
    </div>
  );
}
