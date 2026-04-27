/**
 * Job Detail Page — redesigned per design system.
 *
 * Visual contract:
 * - Two-column layout: posting body (1fr) + 320px sidebar at ≥980px.
 * - Stacks vertically on narrow viewports.
 * - Sidebar consolidates extracted strategic insights into a "Why this matters"
 *   editorial block.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type JobRecord = {
  id: string;
  title: string;
  description_text?: string | null;
  url?: string | null;
  location?: string | null;
  standardized_department?: string | null;
  first_seen_date?: string | null;
};

type CompanyRef = { id: string; name: string; slug: string };

type StrategicInsight = {
  id: string;
  category?: string | null;
  insight_summary?: string | null;
  run_date?: string | null;
};

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

  const j = job as JobRecord & { companies?: CompanyRef };
  const company = j.companies;
  const insightList: StrategicInsight[] = insights ?? [];

  const paragraphs = (j.description_text ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link
            href={
              source === "jobs"
                ? "/jobs"
                : company?.slug
                  ? `/companies/${company.slug}`
                  : "/companies"
            }
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to {source === "jobs" ? "Jobs" : company?.name ?? "Companies"}
          </Link>
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Posting body */}
        <article className="min-w-0 space-y-6">
          <header className="space-y-3 border-b border-border pb-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-primary">
              {company?.name ?? "Unknown company"}
            </p>
            <h1 className="font-display font-semibold text-[32px] tracking-[-0.018em] leading-[1.12] text-foreground">
              {j.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11.5px] tracking-[0.02em] text-muted-foreground">
              {j.standardized_department && <span>{j.standardized_department}</span>}
              {j.location && <span>· {j.location}</span>}
              {j.first_seen_date && (
                <span>· First seen {format(new Date(j.first_seen_date), "MMM d, yyyy")}</span>
              )}
            </div>
          </header>

          {paragraphs.length > 0 ? (
            <div className="space-y-4 max-w-[68ch] text-[15px] leading-[1.65] text-foreground">
              {paragraphs.map((p, i) => (
                <p key={i} className="whitespace-pre-wrap">{p}</p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No description text captured for this posting.
            </p>
          )}

          {j.url && (
            <a
              href={j.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              View original posting
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </article>

        {/* Sidebar */}
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <SidebarBlock title="Why this matters">
            {company ? (
              <>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  Posting from{" "}
                  <Link
                    href={`/companies/${company.slug}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {company.name}
                  </Link>
                  . Read the full company picture for surrounding hiring context.
                </p>
                <Link
                  href={`/companies/${company.slug}`}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Open company drill-down
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Company context unavailable.
              </p>
            )}
          </SidebarBlock>

          {insightList.length > 0 && (
            <SidebarBlock title="Strategic signals">
              <ul className="space-y-3">
                {insightList.map((i) => (
                  <li key={i.id} className="space-y-0.5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      {i.category ?? "signal"}
                    </p>
                    <Link
                      href={`/insights/${i.id}`}
                      className="text-sm text-foreground hover:underline"
                    >
                      {(i.insight_summary ?? "").slice(0, 120)}
                      {(i.insight_summary ?? "").length > 120 && "…"}
                    </Link>
                    {i.run_date && (
                      <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
                        {format(new Date(i.run_date), "MMM d")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </SidebarBlock>
          )}
        </aside>
      </div>
    </div>
  );
}

function SidebarBlock({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[10px] border border-border bg-card px-5 py-4",
        className
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-primary mb-3">
        {title}
      </p>
      {children}
    </section>
  );
}
