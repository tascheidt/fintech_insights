import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

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

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/insights">← Insights</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold">{jp?.title ?? "Job"}</h1>
          <p className="text-muted-foreground">
            {company?.name ?? "Unknown"} · {(insight as { category?: string }).category ?? "—"} · {(insight as { confidence?: string }).confidence ?? "—"} confidence
          </p>
          <p className="text-sm text-muted-foreground">
            {insight.run_date ? format(new Date(insight.run_date), "MMM d, yyyy") : ""}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h2 className="font-semibold mb-1">Insight Summary</h2>
            <p>{(insight as { insight_summary?: string }).insight_summary ?? "—"}</p>
          </div>
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
          {(insight as { is_new_direction?: boolean }).is_new_direction && (
            <p className="text-sm font-medium text-amber-600">New direction signal</p>
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
    </div>
  );
}
