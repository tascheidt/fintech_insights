import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { InsightChat } from "@/components/insights/InsightChat";

export default async function InsightDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: insight, error } = await supabase
    .from("strategic_insights")
    .select(`
      *,
      job_postings!job_posting_id(
        id, title, department, location, url,
        description_text,
        companies(id, name, slug)
      )
    `)
    .eq("id", id)
    .single();

  if (error || !insight) notFound();

  const jp = (insight as { job_postings?: { title: string; department?: string; location?: string; url?: string; description_text?: string; companies?: { name: string; slug: string } } })?.job_postings;
  const company = jp?.companies;
  const signals = (insight as { strategic_signals?: string[] }).strategic_signals;
  const signalsList = Array.isArray(signals) ? signals : [];
  
  // Extract advanced fields
  const insightData = insight as {
    novelty_score?: number | null;
    novelty_reasoning?: string | null;
    is_executive_movement?: boolean | null;
    executive_context?: string | null;
    strategic_hypothesis?: string | null;
    web_context?: any;
    model_reasoning?: string | null;
  };

  // Novelty score badge color
  const getNoveltyColor = (score?: number | null) => {
    if (!score) return "bg-gray-500";
    if (score >= 7) return "bg-red-500";
    if (score >= 5) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getNoveltyLabel = (score?: number | null) => {
    if (!score) return "N/A";
    if (score >= 7) return "Novel";
    if (score >= 5) return "Expansion";
    return "Continuation";
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/insights">← Insights</Link>
        </Button>
      </div>

      {/* Executive Movement Alert */}
      {insightData.is_executive_movement && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="text-amber-600 font-semibold text-lg">⚠️</div>
              <div>
                <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                  Executive Movement Detected
                </h3>
                {insightData.executive_context && (
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    {insightData.executive_context}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{jp?.title ?? "Job"}</h1>
              <p className="text-muted-foreground mt-1">
                {company?.name ?? "Unknown"} · {(insight as { category?: string }).category ?? "—"} · {(insight as { confidence?: string }).confidence ?? "—"} confidence
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {insight.run_date ? format(new Date(insight.run_date), "MMM d, yyyy") : ""}
              </p>
            </div>
            {/* Novelty Score Badge */}
            {insightData.novelty_score !== null && insightData.novelty_score !== undefined && (
              <div className="flex flex-col items-end gap-1">
                <div className={`${getNoveltyColor(insightData.novelty_score)} text-white px-3 py-1 rounded-full text-sm font-semibold`}>
                  {insightData.novelty_score}/10
                </div>
                <span className="text-xs text-muted-foreground">
                  {getNoveltyLabel(insightData.novelty_score)}
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h2 className="font-semibold mb-1">Insight Summary</h2>
            <p>{(insight as { insight_summary?: string }).insight_summary ?? "—"}</p>
          </div>

          {insightData.strategic_hypothesis && (
            <div>
              <h2 className="font-semibold mb-1">Strategic Hypothesis</h2>
              <p className="text-sm">{insightData.strategic_hypothesis}</p>
            </div>
          )}

          {signalsList.length > 0 && (
            <div>
              <h2 className="font-semibold mb-1">Strategic Signals</h2>
              <ul className="list-disc list-inside space-y-1">
                {signalsList.map((s, i) => (
                  <li key={i}>{typeof s === "string" ? s : JSON.stringify(s)}</li>
                ))}
              </ul>
            </div>
          )}

          {insightData.novelty_reasoning && (
            <div>
              <h2 className="font-semibold mb-1">Novelty Assessment</h2>
              <p className="text-sm">{insightData.novelty_reasoning}</p>
            </div>
          )}

          {insightData.web_context && Array.isArray(insightData.web_context) && insightData.web_context.length > 0 && (
            <div>
              <h2 className="font-semibold mb-1">Web Context & Corroboration</h2>
              <div className="space-y-2 text-sm">
                {insightData.web_context.map((item: any, i: number) => (
                  <div key={i} className="border-l-2 pl-3 border-muted">
                    {item.title && <p className="font-medium">{item.title}</p>}
                    {item.snippet && <p className="text-muted-foreground">{item.snippet}</p>}
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs">
                        {item.url}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {insightData.model_reasoning && (
            <details className="border rounded-lg p-4">
              <summary className="font-semibold cursor-pointer">Model Reasoning</summary>
              <p className="text-sm mt-2 whitespace-pre-wrap">{insightData.model_reasoning}</p>
            </details>
          )}

          {(insight as { is_new_direction?: boolean }).is_new_direction && (
            <div className="text-sm font-medium text-amber-600 dark:text-amber-400">
              ✓ New direction signal
            </div>
          )}
        </CardContent>
      </Card>

      {jp && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Job Details</h2>
            {jp.department && <p className="text-sm text-muted-foreground">{jp.department}</p>}
            {jp.location && <p className="text-sm text-muted-foreground">{jp.location}</p>}
          </CardHeader>
          <CardContent className="space-y-4">
            {jp.description_text && (
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-sm">{jp.description_text.slice(0, 3000)}{jp.description_text.length > 3000 ? "…" : ""}</pre>
              </div>
            )}
            {jp.url && (
              <a href={jp.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                View original posting
              </a>
            )}
            <Button asChild>
              <Link href={`/jobs/${(insight as { job_posting_id: string }).job_posting_id}`}>View full job</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Conversational Follow-up */}
      <InsightChat insightId={id} />
    </div>
  );
}
