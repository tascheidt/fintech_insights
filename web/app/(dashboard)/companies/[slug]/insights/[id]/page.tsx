import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { format } from "date-fns";
import { FunctionBreakdown } from "@/components/companies/FunctionBreakdown";
import { CompanyInsightChat } from "@/components/companies/CompanyInsightChat";

export default async function CompanyInsightDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();

  // Get company
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (companyError || !company) notFound();

  // Get insight
  const { data: insight, error: insightError } = await supabase
    .from("company_insights")
    .select("*")
    .eq("id", id)
    .eq("company_id", company.id)
    .single();

  if (insightError || !insight) notFound();

  const coreFunctions = (insight.core_functions as any[]) || [];
  const discrepancies = (insight.discrepancies as any[]) || [];
  const newDirections = (insight.new_directions as string[]) || [];
  const researchSources = (insight.research_sources as any[]) || [];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/companies/${slug}/insights`}>← Insights</Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{company.name} Strategic Insight</h1>
          <p className="text-muted-foreground mt-1">
            Analysis period: {format(new Date(insight.analysis_period_start), "MMM d")} -{" "}
            {format(new Date(insight.analysis_period_end), "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* New Directions */}
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

      {/* Alignment Analysis & Discrepancies */}
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
                    {(d.implication) && (
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

      {/* Stated Strategy from Research */}
      {insight.stated_strategy && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Company&apos;s Stated Strategy</h2>
            <p className="text-sm text-muted-foreground">
              Extracted from public sources
            </p>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{insight.stated_strategy}</p>
          </CardContent>
        </Card>
      )}

      {/* Research Sources */}
      {researchSources.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Research Sources</h2>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      {/* Model Reasoning (collapsible) */}
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

      {/* Metadata */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span>
              Generated: {format(new Date(insight.generated_at), "MMM d, yyyy HH:mm")}
            </span>
            <span>Research Depth: {insight.research_depth}</span>
            {insight.is_public_company !== null && (
              <span>
                Company Type: {insight.is_public_company ? "Public" : "Private"}
              </span>
            )}
            {insight.generation_cost_estimate && (
              <span>Est. Cost: ${insight.generation_cost_estimate.toFixed(2)}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Chat with Insight */}
      <CompanyInsightChat
        companyId={company.id}
        insightId={insight.id}
        companyName={company.name}
      />
    </div>
  );
}
