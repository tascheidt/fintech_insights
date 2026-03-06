/**
 * Company Detail Page
 * 
 * Shows company overview, strategic insights, job postings with card/table toggle,
 * and job history with filters.
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditCompanyForm } from "@/components/companies/EditCompanyForm";
import { CompanyDigestSummary } from "@/components/companies/CompanyDigestSummary";
import { CompanyTechStack } from "@/components/companies/CompanyTechStack";
import { DeleteCompanyButton } from "@/components/companies/DeleteCompanyButton";
import { JobHistoryView, JobData } from "@/components/companies/JobHistoryView";

export default async function CompanyDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const canEdit = ["editor", "admin"].includes(profile?.role ?? "");

  const { data: company, error } = await supabase
    .from("companies")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (error || !company) notFound();

  const [{ data: jobsRaw }, { data: latestInsight }, { data: digestSummary }] = await Promise.all([
    supabase
      .from("job_postings")
      .select("id, title, standardized_department, function_category, location, is_active, first_seen_date, url")
      .eq("company_id", company.id)
      .order("first_seen_date", { ascending: false }),
    supabase
      .from("company_insights")
      .select("*")
      .eq("company_id", company.id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .single(),
    // Get latest weekly digest summary for this company
    supabase
      .from("weekly_digest_companies")
      .select(`
        id,
        headline,
        body,
        new_job_count,
        dominant_tech,
        weekly_digests!inner(week_start, week_end)
      `)
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  // Transform digestSummary to match DigestSummary interface
  // Supabase returns joined relations as arrays, so we need to extract the first element
  const transformedDigestSummary = digestSummary
    ? {
        ...digestSummary,
        weekly_digests: Array.isArray(digestSummary.weekly_digests)
          ? digestSummary.weekly_digests[0]
          : digestSummary.weekly_digests,
      }
    : null;

  // Transform jobs data for JobHistoryView
  const jobs: JobData[] = (jobsRaw ?? []).map((j: any) => ({
    id: j.id,
    title: j.title,
    standardized_department: j.standardized_department,
    function_category: j.function_category,
    location: j.location,
    isActive: j.is_active,
    firstSeenDate: j.first_seen_date,
    url: j.url,
  }));

  // Count active vs inactive jobs
  const activeJobCount = jobs.filter(j => j.isActive).length;
  const inactiveJobCount = jobs.filter(j => !j.isActive).length;

  // Get ATS label for display
  const atsLabels: Record<string, string> = {
    lever: "Lever",
    greenhouse: "Greenhouse",
    workable: "Workable",
    ashby: "Ashby",
    dayforce: "Dayforce",
    workday: "Workday",
    smartrecruiters: "SmartRecruiters",
    bamboohr: "BambooHR",
    jazzhr: "JazzHR",
    recruitee: "Recruitee",
    custom: "Custom",
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="jobs">
            Jobs ({jobs.length})
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Company Header */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold">{company.name}</h1>
                  <div className="flex items-center gap-2 mt-2 text-muted-foreground">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted">
                      {company.country}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {atsLabels[company.ats_type] ?? company.ats_type}
                    </span>
                    {!company.is_active && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Active Jobs</p>
                  <p className="font-semibold text-green-600">{activeJobCount}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Closed Jobs</p>
                  <p className="font-semibold text-gray-500">{inactiveJobCount}</p>
                </div>
                {company.careers_url && (
                  <div>
                    <p className="text-sm text-muted-foreground">Careers Page</p>
                    <a
                      href={company.careers_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline text-sm truncate block"
                    >
                      {company.careers_url}
                    </a>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Weekly Digest Summary with expandable 90-day insights */}
          <CompanyDigestSummary
            digestSummary={transformedDigestSummary}
            insight={latestInsight}
            companyId={company.id}
            companyName={company.name}
            companySlug={company.slug}
          />

          {/* Tech Stack */}
          <CompanyTechStack
            companyId={company.id}
            companyName={company.name}
            initialTechStack={company.tech_stack ?? null}
            initialGeneratedAt={company.tech_stack_generated_at ?? null}
          />
        </TabsContent>

        {/* Jobs Tab - Combined with toggle */}
        <TabsContent value="jobs">
          <JobHistoryView
            jobs={jobs}
            companySlug={company.slug}
            initialStatus="all"
            showHeader={true}
            pageSize={24}
          />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <div className="space-y-6">
            <EditCompanyForm company={company} />
            {canEdit && (
              <div className="flex items-center gap-4 pt-4 border-t">
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">
                    Delete this company to hide it from your list. Historical data will be preserved.
                  </p>
                </div>
                <DeleteCompanyButton companyId={company.id} companyName={company.name} />
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
