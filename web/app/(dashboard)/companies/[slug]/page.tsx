/**
 * Company Detail Page
 *
 * v2 (Stream L): the Overview tab is rebuilt as a bets-first editorial
 * page. The Tabs (Overview / Jobs / Settings) chrome is preserved; the
 * Jobs tab still renders `JobHistoryView` for company-scoped browsing
 * and the Settings tab hosts the existing edit form.
 *
 * Data is fetched once via `getCompanyDrillDownData` (companies +
 * normalised bets + every active job assigned to the matching bet) plus
 * `getAllCompanyJobsWithBets` for the all-jobs drawer view.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
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
import { WorkingThesisCard } from "@/components/companies/WorkingThesisCard";
import { CompanyOverviewBets } from "@/components/companies/CompanyOverviewBets";
import { CompanyHeaderPill } from "@/components/companies/CompanyHeaderPill";
import { IncumbentSignalPanel } from "@/components/companies/IncumbentSignalPanel";
import { MonogramAvatar } from "@/components/design";
import { TierBadge } from "@/components/ui/TierBadge";
import { Button } from "@/components/ui/button";
import {
  getCompanyDrillDownData,
  getAllCompanyJobsWithBets,
  getIncumbentBets,
} from "@/lib/dashboard-queries";
import { Bell, ExternalLink, Info } from "lucide-react";
import { format } from "date-fns";

export default async function CompanyDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const canEdit = ["editor", "admin"].includes(profile?.role ?? "");
  const isAdmin = (profile?.role ?? "") === "admin";

  const drilldown = await getCompanyDrillDownData(slug);
  if (!drilldown) notFound();

  const { data: company, error } = await supabase
    .from("companies")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (error || !company) notFound();

  // Phase 2: incumbent banks get a deliberately quieter Overview — a
  // "Senior hiring signal" panel instead of the bets-first editorial, an
  // expectation-management callout, and an admin-only Generate Insight
  // button. The fintech path below is unchanged.
  const isIncumbent = company.tier === "incumbent";
  const incumbentBet = isIncumbent
    ? (await getIncumbentBets({ companyId: company.id }))[0] ?? null
    : null;

  const allJobsWithBets = await getAllCompanyJobsWithBets(drilldown.company.id);

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

  type JobRow = {
    id: string;
    title: string;
    standardized_department: string | null;
    function_category: string | null;
    location: string | null;
    is_active: boolean;
    first_seen_date: string;
    url: string | null;
  };

  const jobs: JobData[] = (jobsRaw ?? []).map((j: JobRow) => ({
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

  type CoreFunction = {
    category: string;
    label: string;
    group: string;
    count: number;
    percentage: number;
  };
  type Discrepancy = {
    severity?: "high" | "medium" | "low";
    area?: string;
    statedStrategy?: string;
    stated_strategy?: string;
    actualHiring?: string;
    actual_hiring?: string;
    implication?: string;
  };
  type ResearchSource = {
    verificationStatus?: "verified" | "paywall" | string;
    sourceType?: string;
    url?: string;
    title?: string;
    snippet?: string;
  };

  const insight = latestInsight ?? null;
  const coreFunctions = (insight?.core_functions as CoreFunction[] | null) ?? [];
  const discrepancies = (insight?.discrepancies as Discrepancy[] | null) ?? [];
  const newDirections = (insight?.new_directions as string[] | null) ?? [];
  const researchSources = (insight?.research_sources as ResearchSource[] | null) ?? [];

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

        {/* Overview Tab — incumbent variant: a quieter "Senior hiring
            signal" panel instead of the bets-first editorial (spec §Surface 5). */}
        {isIncumbent ? (
          <TabsContent value="overview" className="space-y-6">
            {/* Breadcrumb */}
            <div className="font-sans text-[12.5px] text-muted-foreground">
              <Link href="/companies" className="hover:text-primary">
                Companies
              </Link>
              <span className="mx-1.5">/</span>
              <span>{company.name}</span>
            </div>

            {/* Company head — avatar + name + TierBadge + meta. */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3.5">
                <MonogramAvatar size="lg" name={company.name} />
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <h1 className="m-0 font-display font-semibold text-foreground text-[26px] leading-[1.15] tracking-[-0.02em] sm:text-[32px]">
                      {company.name}
                    </h1>
                    <TierBadge
                      tier="incumbent"
                      size="md"
                      className="self-center"
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-[12.5px] text-muted-foreground">
                    {company.country && <span>{company.country}</span>}
                    {company.country && company.ats_type && (
                      <span aria-hidden>·</span>
                    )}
                    {company.ats_type && <span>ATS: {company.ats_type}</span>}
                    <span aria-hidden>·</span>
                    <CompanyHeaderPill
                      activeJobCount={drilldown.activeJobCount}
                      companyName={company.name}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" disabled title="Coming soon">
                  <Bell className="h-3.5 w-3.5" /> Watch
                </Button>
                {company.careers_url && (
                  <Button variant="ghost" size="sm" asChild>
                    <a
                      href={company.careers_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Careers site
                    </a>
                  </Button>
                )}
                {/* Generate Insight is admin-only for incumbents — a grounded
                    Pro analysis is expensive and not the default flow here
                    (spec §Surface 5 §4 / locked Q4). Hidden, not disabled. */}
                {isAdmin && (
                  <GenerateInsightButton
                    companyId={company.id}
                    companyName={company.name}
                  />
                )}
              </div>
            </div>

            {/* Context callout — the key expectation-management surface. */}
            <div className="flex items-start gap-2 rounded-lg bg-secondary px-3.5 py-2.5">
              <Info
                className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                {company.name} is an incumbent bank. Its hiring is tracked for
                senior-role signal and is deliberately excluded from
                cross-fintech volume metrics — its posting counts will not
                match the dashboard.
              </p>
            </div>

            {/* Senior hiring signal panel */}
            <IncumbentSignalPanel bet={incumbentBet} />

            {/* Tech Stack */}
            <CompanyTechStack
              companyId={company.id}
              initialTechStack={company.tech_stack ?? null}
              initialGeneratedAt={company.tech_stack_generated_at ?? null}
            />
          </TabsContent>
        ) : (
        /* Overview Tab — bets-first editorial v2 (fintech) */
        <TabsContent value="overview" className="space-y-6">
          {/* Breadcrumb */}
          <div className="font-sans text-[12.5px] text-muted-foreground">
            <Link href="/companies" className="hover:text-primary">
              Companies
            </Link>
            <span className="mx-1.5">/</span>
            <span>{drilldown.company.name}</span>
          </div>

          {/* Company head — avatar + name + meta with active-postings pill.
              Mobile stacks the action buttons under the name; desktop keeps
              them on the right. */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3.5">
              <MonogramAvatar size="lg" name={drilldown.company.name} />
              <div className="min-w-0">
                <h1
                  className="m-0 font-display font-semibold text-foreground text-[26px] leading-[1.15] tracking-[-0.02em] sm:text-[32px]"
                >
                  {drilldown.company.name}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-[12.5px] text-muted-foreground">
                  {drilldown.company.country && (
                    <span>{drilldown.company.country}</span>
                  )}
                  {drilldown.company.country && drilldown.company.ats_type && (
                    <span aria-hidden>·</span>
                  )}
                  {drilldown.company.ats_type && (
                    <span>ATS: {drilldown.company.ats_type}</span>
                  )}
                  <span aria-hidden>·</span>
                  <CompanyHeaderPill
                    activeJobCount={drilldown.activeJobCount}
                    companyName={drilldown.company.name}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" disabled title="Coming soon">
                <Bell className="h-3.5 w-3.5" /> Watch
              </Button>
              {drilldown.company.careers_url && (
                <Button variant="ghost" size="sm" asChild>
                  <a
                    href={drilldown.company.careers_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Careers site
                  </a>
                </Button>
              )}
              <GenerateInsightButton
                companyId={company.id}
                companyName={company.name}
              />
            </div>
          </div>

          {/* Working thesis */}
          <WorkingThesisCard
            thesis={drilldown.company.thesis}
            thesisSub={drilldown.company.thesis_sub}
            updatedAgo={drilldown.thesisAgo}
            metrics={[
              {
                label: "Active roles",
                value: String(drilldown.activeJobCount),
              },
              {
                label: "30d net new",
                value:
                  drilldown.hiringDelta > 0
                    ? `+${drilldown.hiringDelta}`
                    : String(drilldown.hiringDelta),
              },
              {
                label: "New patterns",
                value: String(drilldown.newPatternsCount),
              },
              {
                label: "Roles per bet",
                value: drilldown.rolesPerBet.toFixed(1),
              },
            ]}
            editHref={`/companies/${drilldown.company.slug}?edit=1`}
          />

          {/* Recent activity strip */}
          {digestSummary && digestWeek && (
            <p className="text-sm text-muted-foreground">
              {digestSummary.new_job_count} new jobs · Week of{" "}
              {format(new Date(digestWeek.week_start), "MMM d")}–{format(new Date(digestWeek.week_end), "MMM d")}
            </p>
          )}

          {/* Bets-first section */}
          <CompanyOverviewBets
            companyName={drilldown.company.name}
            companySlug={drilldown.company.slug}
            bets={drilldown.bets}
            allJobs={allJobsWithBets}
            activeJobCount={drilldown.activeJobCount}
          />

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
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide ${
                    insight.confidence === "high"
                      ? "bg-primary-soft text-primary-soft-foreground"
                      : insight.confidence === "medium"
                        ? "bg-accent-soft text-accent-soft-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {insight.confidence} confidence
                </span>
                {insight.research_quality_score && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide bg-highlight-soft text-highlight-soft-foreground">
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
                          <span className="text-growth-500 mt-1" aria-hidden>●</span>
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
                        {discrepancies.map((d, i) => (
                          <div
                            key={i}
                            className={`p-3 rounded-lg border-l-4 ${
                              d.severity === "high"
                                ? "border-sunset-500 bg-accent-soft/40"
                                : d.severity === "medium"
                                  ? "border-sun-500 bg-highlight-soft/40"
                                  : "border-border bg-muted/40"
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

              {/* Stated Strategy — editorial display per design system */}
              {insight.stated_strategy && (
                <Card>
                  <CardHeader>
                    <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-primary mb-1">
                      Stated strategy
                    </p>
                    <h2 className="font-display font-semibold text-[22px] tracking-[-0.012em] leading-[1.18] text-foreground">
                      In their own words
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">Extracted from public sources</p>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap font-display text-[18px] leading-[1.5] text-foreground/90">
                      {insight.stated_strategy}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Tech Stack */}
              <CompanyTechStack
                companyId={company.id}
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
                      {researchSources.map((source, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide ${
                              source.verificationStatus === "verified"
                                ? "bg-primary-soft text-primary-soft-foreground"
                                : source.verificationStatus === "paywall"
                                  ? "bg-highlight-soft text-highlight-soft-foreground"
                                  : "bg-muted text-muted-foreground"
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
              initialTechStack={company.tech_stack ?? null}
              initialGeneratedAt={company.tech_stack_generated_at ?? null}
            />
          )}
        </TabsContent>
        )}

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
