/**
 * Jobs Page
 * 
 * Shows all job postings across all companies with search and filters.
 * Uses the same JobHistoryView component as company pages.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JobHistoryView, JobData } from "@/components/companies/JobHistoryView";

export default async function JobsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch all jobs with company information
  const { data: jobsRaw } = await supabase
    .from("job_postings")
    .select("id, title, standardized_department, location, is_active, first_seen_date, url, companies(id, name, slug)")
    .order("first_seen_date", { ascending: false });

  // Transform jobs data for JobHistoryView
  const jobs: JobData[] = (jobsRaw ?? []).map((j: any) => {
    const company = Array.isArray(j.companies) ? j.companies[0] : j.companies;
    return {
      id: j.id,
      title: j.title,
      standardized_department: j.standardized_department,
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
        initialStatus="all"
        showHeader={true}
        pageSize={24}
      />
    </div>
  );
}
