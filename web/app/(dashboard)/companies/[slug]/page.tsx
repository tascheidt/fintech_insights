/**
 * Company Detail Page
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EditCompanyForm } from "@/components/companies/EditCompanyForm";
import { CompanyTechStack } from "@/components/companies/CompanyTechStack";
import { DeleteCompanyButton } from "@/components/companies/DeleteCompanyButton";
import { JobHistoryView, JobData } from "@/components/companies/JobHistoryView";
import { FunctionBreakdown } from "@/components/companies/FunctionBreakdown";
import { ChatPanel } from "@/components/companies/ChatPanel";
import { GenerateInsightButton } from "@/components/companies/GenerateInsightButton";
import { ExternalLink } from "lucide-react";
import { format } from "date-fns";

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
        new_job_count,
        weekly_digests!inner(week_start, week_end)
      `)
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  const digestWeek = digestSummary
    ? (Array.isArray(digestSummary.weekly_digests)
        ? digestSummary.weekly_digests[0]
        : digestSummary.weekly_digests) as { week_start: string; week_end: string }
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

  const insight = latestInsight ?? null;
  const coreFunctions = (insight?.core_functions as any[]) || [];
  const discrepancies = (insight?.discrepancies as any[]) || [];
  const newDirections = (insight?.new_directions as string[]) || [];
  const researchSources = (insight?.research_sources as any[]) || [];

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
          {/* Company Header */}
          <div className="flex items-start justify-between">
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
            <GenerateInsightButton companyId={company.id} companyName={company.name} />
          </div>

          {/* Recent Activity Strip */}
          {digestSummary && digestWeek && (
            <p className="text-sm text-muted-foreground">
              {digestSummary.new_job_count} new jobs · Week of{" "}
              {format(new Date(digestWeek.week_start), "MMM d")}–{format(new Date(digestWeek.week_end), "MMM d")}
            </p>
          )}

          {/* No insight yet */}
          {!insight && (
            <Card>
              <CardContent className="py-12">
                <div className="text-center space-y-4">
                  <h3 className="text-lg font-semibold">No Analysis Yet</h3>
                  <p className="text-muted-foreground text-sm">
                    Generate a strategic insight to analyze {company.name}&apos;s hiring patterns.
                  </p>
                  <GenerateInsightButton companyId={company.id} companyName={company.name} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Full Analysis — inline */}
          {insight && (
            <>
              {/* Analysis Metadata Row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">
                  {format(new Date(insight.analysis_period_start), "MMM d")}–{format(new Date(insight.analysis_period_end), "MMM d, yyyy")}
                </span>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    insight.confidence === "high"
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : insight.confidence === "medium"
                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                        : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                  }`}
                >
                  {insight.confidence} confidence
                </span>
                {insight.research_quality_score && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    Research: {insight.research_quality_score}/5
                  </span>
                )}
              </div>

              {/* Executive Summary */}
              <Card>
                <CardHeader>
                  <h2 className="font-semibold">Executive Summary</h2>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{insight.executive_summary}</p>
                </CardContent>
              </Card>

              {/* Strategic Hypothesis */}
              <Card>
                <CardHeader>
                  <h2 className="font-semibold">Strategic Hypothesis</h2>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{insight.strategic_hypothesis}</p>
                </CardContent>
              </Card>

              {/* Function Breakdown */}
              {coreFunctions.length > 0 && (
                <FunctionBreakdown functions={coreFunctions} />
              )}

              {/* New Strategic Directions */}
              {newDirections.length > 0 && (
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold">New Strategic Directions</h2>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {newDirections.map((direction, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-green-600 mt-1">●</span>
                          <span>{direction}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Alignment & Discrepancies */}
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold">Alignment Analysis</h2>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">
                      {insight.alignment_analysis || "No alignment analysis available."}
                    </p>
                  </CardContent>
                </Card>

                {discrepancies.length > 0 && (
                  <Card>
                    <CardHeader>
                      <h2 className="font-semibold">Discrepancies</h2>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {discrepancies.map((d: any, i: number) => (
                          <div
                            key={i}
                            className={`p-3 rounded-lg border-l-4 ${
                              d.severity === "high"
                                ? "border-red-500 bg-red-50 dark:bg-red-950"
                                : d.severity === "medium"
                                  ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950"
                                  : "border-gray-300 bg-gray-50 dark:bg-gray-900"
                            }`}
                          >
                            <div className="font-medium">{d.area}</div>
                            <div className="text-sm text-muted-foreground mt-1">
                              <strong>Stated:</strong> {d.statedStrategy || d.stated_strategy}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              <strong>Actual:</strong> {d.actualHiring || d.actual_hiring}
                            </div>
                            {d.implication && (
                              <div className="text-sm mt-2">{d.implication}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Strategic Implications */}
              {insight.strategic_implications && (
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold">Strategic Implications</h2>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{insight.strategic_implications}</p>
                  </CardContent>
                </Card>
              )}

              {/* Stated Strategy */}
              {insight.stated_strategy && (
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold">Company&apos;s Stated Strategy</h2>
                    <p className="text-sm text-muted-foreground">Extracted from public sources</p>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{insight.stated_strategy}</p>
                  </CardContent>
                </Card>
              )}

              {/* Tech Stack */}
              <CompanyTechStack
                companyId={company.id}
                companyName={company.name}
                initialTechStack={company.tech_stack ?? null}
                initialGeneratedAt={company.tech_stack_generated_at ?? null}
              />

              {/* Research Sources */}
              {researchSources.length > 0 && (
                <details className="border rounded-lg">
                  <summary className="px-6 py-4 font-semibold cursor-pointer hover:bg-muted/50">
                    Research Sources ({researchSources.length})
                  </summary>
                  <div className="px-6 pb-4">
                    <div className="space-y-3">
                      {researchSources.map((source: any, i: number) => (
                        <div key={i} className="flex items-start gap-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              source.verificationStatus === "verified"
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                : source.verificationStatus === "paywall"
                                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                  : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                            }`}
                          >
                            {source.sourceType}
                          </span>
                          <div className="flex-1 min-w-0">
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline text-sm font-medium"
                            >
                              {source.title}
                            </a>
                            {source.snippet && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {source.snippet}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              )}

              {/* Model Reasoning */}
              {insight.model_reasoning && (
                <details className="border rounded-lg">
                  <summary className="px-6 py-4 font-semibold cursor-pointer hover:bg-muted/50">
                    Model Reasoning
                  </summary>
                  <div className="px-6 pb-4">
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                      {insight.model_reasoning}
                    </p>
                  </div>
                </details>
              )}

              {/* Metadata Footer */}
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap">
                    <span>Generated: {format(new Date(insight.generated_at), "MMM d, yyyy HH:mm")}</span>
                    <span>Research Depth: {insight.research_depth}</span>
                    {insight.is_public_company !== null && (
                      <span>Company Type: {insight.is_public_company ? "Public" : "Private"}</span>
                    )}
                    {insight.generation_cost_estimate && (
                      <span>Est. Cost: ${insight.generation_cost_estimate.toFixed(2)}</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Floating chat panel */}
              <ChatPanel
                companyId={company.id}
                insightId={insight.id}
                companyName={company.name}
              />
            </>
          )}

          {/* Tech Stack when no insight */}
          {!insight && (
            <CompanyTechStack
              companyId={company.id}
              companyName={company.name}
              initialTechStack={company.tech_stack ?? null}
              initialGeneratedAt={company.tech_stack_generated_at ?? null}
            />
          )}
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
