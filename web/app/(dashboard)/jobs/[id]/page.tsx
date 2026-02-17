/**
 * Job Detail Page
 * 
 * Shows individual job posting details.
 * Note: This page is kept for deep links. Jobs are now primarily accessed
 * through company pages at /companies/[slug].
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { format } from "date-fns";

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { id } = await params;
  const { source } = await searchParams;
  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from("job_postings")
    .select("*, companies(id, name, slug), standardized_department")
    .eq("id", id)
    .single();

  if (error || !job) notFound();

  const { data: insights } = await supabase
    .from("strategic_insights")
    .select("id, category, insight_summary, run_date")
    .eq("job_posting_id", id)
    .order("run_date", { ascending: false });

  const company = (job as { companies?: { name: string; slug: string } }).companies;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={source === "jobs" ? "/jobs" : company?.slug ? `/companies/${company.slug}` : "/companies"}>
            ← Back to {source === "jobs" ? "Jobs" : company?.name ?? "Companies"}
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold">{(job as { title: string }).title}</h1>
          <p className="text-muted-foreground">
            <Link href={`/companies/${company?.slug ?? ""}`} className="hover:underline">{company?.name ?? "Unknown"}</Link>
            {" · "}
            {(job as { standardized_department?: string }).standardized_department ?? "—"}
            {" · "}
            {(job as { location?: string }).location ?? "—"}
          </p>
          <p className="text-sm text-muted-foreground">
            First seen: {(job as { first_seen_date?: string }).first_seen_date ? format(new Date((job as { first_seen_date: string }).first_seen_date), "MMM d, yyyy") : "—"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {(job as { description_text?: string }).description_text && (
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-sm">{(job as { description_text: string }).description_text}</pre>
            </div>
          )}
          {(job as { url?: string }).url && (
            <a href={(job as { url: string }).url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              View original posting
            </a>
          )}
        </CardContent>
      </Card>
      {(insights ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Strategic Insights</h2>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(insights as { id: string; category?: string; insight_summary?: string; run_date?: string }[]).map((i) => (
                <li key={i.id}>
                  <Link href={`/insights/${i.id}`} className="hover:underline">
                    {i.category ?? "—"}: {i.insight_summary?.slice(0, 100) ?? ""}…
                  </Link>
                  <span className="text-xs text-muted-foreground ml-2">
                    {i.run_date ? format(new Date(i.run_date), "MMM d") : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
