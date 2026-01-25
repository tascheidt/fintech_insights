/**
 * Company Detail Page
 * 
 * Shows company overview, strategic insights, job postings with card/table toggle,
 * and job history with filters.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { EditCompanyForm } from "@/components/companies/EditCompanyForm";
import { CompanyInsightsCard } from "@/components/companies/CompanyInsightsCard";
import { DeleteCompanyButton } from "@/components/companies/DeleteCompanyButton";
import { JobHistoryView, JobData } from "@/components/companies/JobHistoryView";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

  const [{ data: jobsRaw }, { data: latestInsight }, { data: tasks }] = await Promise.all([
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
    supabase
      .from("job_run_tasks")
      .select(`
        *,
        job_runs(
          id,
          job_type,
          trigger_type,
          started_at,
          completed_at,
          status
        )
      `)
      .eq("company_id", company.id)
      .order("started_at", { ascending: false })
      .limit(50),
  ]);

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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/companies">← Companies</Link>
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="jobs">
            Active Jobs ({activeJobCount})
          </TabsTrigger>
          <TabsTrigger value="history">
            All Jobs ({jobs.length})
          </TabsTrigger>
          <TabsTrigger value="runs">Processing History</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
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
                    {company.track_for_strategy && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                        Strategic
                      </span>
                    )}
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
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-sm text-muted-foreground">ATS Identifier</p>
                  <p className="font-mono">{company.ats_identifier}</p>
                </div>
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
        </TabsContent>

        {/* Insights Tab */}
        <TabsContent value="insights">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Strategic Insights</h2>
                <p className="text-sm text-muted-foreground">
                  Company-level analysis of hiring patterns
                </p>
              </div>
              <Button asChild>
                <Link href={`/companies/${company.slug}/insights`}>View All Insights →</Link>
              </Button>
            </div>
            
            {latestInsight ? (
              <CompanyInsightsCard
                insight={latestInsight}
                companySlug={company.slug}
                isLatest
              />
            ) : (
              <Card>
                <CardContent className="py-8">
                  <div className="text-center">
                    <h3 className="font-semibold mb-2">No Insights Yet</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      Generate strategic insights to analyze {company.name}&apos;s hiring patterns.
                    </p>
                    <Button asChild>
                      <Link href={`/companies/${company.slug}/insights`}>
                        Generate First Insight
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Active Jobs Tab - With Card/Table Toggle */}
        <TabsContent value="jobs">
          <JobHistoryView
            jobs={jobs}
            companySlug={company.slug}
            initialStatus="active"
            showHeader={true}
          />
        </TabsContent>

        {/* All Jobs/History Tab - With Filters */}
        <TabsContent value="history">
          <JobHistoryView
            jobs={jobs}
            companySlug={company.slug}
            initialStatus="all"
            showHeader={true}
            pageSize={24}
          />
        </TabsContent>

        {/* Processing History Tab */}
        <TabsContent value="runs">
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Processing History</h2>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job Type</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Results</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(tasks ?? []).map((task: any) => {
                    const jobRun = Array.isArray(task.job_runs) ? task.job_runs[0] : task.job_runs;
                    return (
                      <TableRow key={task.id}>
                        <TableCell>
                          <span className="capitalize">{jobRun?.job_type || "collect"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="capitalize">{jobRun?.trigger_type || "manual"}</span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              task.status === "completed"
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                : task.status === "failed"
                                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                : task.status === "running"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                            }`}
                          >
                            {task.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          {task.started_at
                            ? format(new Date(task.started_at), "MMM d, yyyy HH:mm")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {jobRun?.job_type === "collect" ? (
                            <div className="text-sm">
                              {task.new_jobs} new, {task.updated_jobs} updated, {task.closed_jobs} closed
                            </div>
                          ) : (
                            <div className="text-sm">{task.insights_generated} insights</div>
                          )}
                          {task.error_message && (
                            <div className="text-xs text-red-600 mt-1">{task.error_message}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {(tasks ?? []).length === 0 && (
                <p className="py-4 text-center text-muted-foreground">No processing history yet.</p>
              )}
            </CardContent>
          </Card>
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
