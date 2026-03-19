/**
 * Jobs Page
 * 
 * Shows all job postings across all companies with search and filters.
 * Uses the same JobHistoryView component as company pages.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JobHistoryView, JobData } from "@/components/companies/JobHistoryView";

type JobsPageSearchParams = {
  status?: string;
  time?: string;
  date?: string;
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

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<JobsPageSearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const initialStatus = getInitialStatus(params.status);
  const initialTimeFilter = getInitialTimeFilter(params.time, params.date);

  // Fetch all jobs with company information
  const { data: jobsRaw } = await supabase
    .from("job_postings")
    .select("id, title, standardized_department, function_category, location, is_active, first_seen_date, url, companies(id, name, slug)")
    .order("first_seen_date", { ascending: false });

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
        showHeader={true}
        pageSize={24}
      />
    </div>
  );
}
