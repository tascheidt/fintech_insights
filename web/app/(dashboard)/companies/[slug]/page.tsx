/**
 * Company Detail Page
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditCompanyForm } from "@/components/companies/EditCompanyForm";
import { CompanyDigestSummary } from "@/components/companies/CompanyDigestSummary";
import { CompanyTechStack } from "@/components/companies/CompanyTechStack";
import { DeleteCompanyButton } from "@/components/companies/DeleteCompanyButton";
import { JobHistoryView, JobData } from "@/components/companies/JobHistoryView";
import { ExternalLink } from "lucide-react";

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

  const transformedDigestSummary = digestSummary
    ? {
        ...digestSummary,
        weekly_digests: Array.isArray(digestSummary.weekly_digests)
          ? digestSummary.weekly_digests[0]
          : digestSummary.weekly_digests,
      }
    : null;

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

  const activeJobCount = jobs.filter(j => j.isActive).length;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="jobs">
            Jobs ({activeJobCount} active)
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Bare Typography Header */}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{company.name}</h1>
              {company.careers_url && (
                <a
                  href={company.careers_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title="Careers page"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {company.country}
            </p>
          </div>

          {/* Weekly Digest Summary */}
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

        {/* Jobs Tab */}
        <TabsContent value="jobs">
          <JobHistoryView
            jobs={jobs}
            companySlug={company.slug}
            initialStatus="all"
            showHeader={false}
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
