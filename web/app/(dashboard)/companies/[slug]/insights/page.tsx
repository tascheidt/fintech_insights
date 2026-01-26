import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { format } from "date-fns";
import { CompanyInsightsCard } from "@/components/companies/CompanyInsightsCard";
import { GenerateInsightButton } from "@/components/companies/GenerateInsightButton";

export default async function CompanyInsightsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // Get company
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (companyError || !company) notFound();

  // Get insights
  const { data: insights } = await supabase
    .from("company_insights")
    .select("*")
    .eq("company_id", company.id)
    .order("generated_at", { ascending: false })
    .limit(20);

  const latestInsight = insights?.[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/companies/${slug}`}>← {company.name}</Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Strategic Insights</h1>
          <p className="text-muted-foreground mt-1">
            Company-level analysis of {company.name}&apos;s hiring patterns
          </p>
        </div>
        <GenerateInsightButton companyId={company.id} companyName={company.name} />
      </div>

      {/* Latest Insight Summary */}
      {latestInsight && (
        <CompanyInsightsCard
          insight={latestInsight}
          companySlug={company.slug}
          isLatest
        />
      )}

      {/* Historical Insights */}
      {insights && insights.length > 1 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Historical Insights</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {insights.slice(1).map((insight) => (
                <div
                  key={insight.id}
                  className="flex items-start justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          insight.confidence === "high"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : insight.confidence === "medium"
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                        }`}
                      >
                        {insight.confidence} confidence
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(insight.analysis_period_start), "MMM d")} -{" "}
                        {format(new Date(insight.analysis_period_end), "MMM d, yyyy")}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2">{insight.executive_summary}</p>
                  </div>
                  <Button variant="ghost" size="sm" asChild className="ml-4">
                    <Link href={`/companies/${company.slug}/insights/${insight.id}`}>
                      View →
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(!insights || insights.length === 0) && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">No Insights Yet</h3>
              <p className="text-muted-foreground mb-4">
                Generate your first strategic insight to analyze {company.name}&apos;s
                hiring patterns.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
