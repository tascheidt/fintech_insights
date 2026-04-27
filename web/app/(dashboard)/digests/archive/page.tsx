/**
 * Digests Archive — chronological list of past weekly digests.
 *
 * Visual contract:
 * - Row: date range + year, lede sentence, signal-density pips (max 5),
 *   net hiring number, arrow.
 * - Year filter: "All / 2026 / 2025" pill toggle (URL-driven).
 * - Click row → /digests/[id].
 */

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { ArrowRight, Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/feedback/EmptyState";

type DigestRow = {
  id: string;
  week_start: string;
  week_end: string;
  global_summary: { headline?: string; key_insight?: string } | null;
  strategy_signals: unknown[] | null;
  industry_trends: unknown[] | null;
  generated_at: string;
};

export default async function DigestArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year } = await searchParams;
  const supabase = await createClient();

  const { data: digests } = await supabase
    .from("weekly_digests")
    .select("id, week_start, week_end, global_summary, strategy_signals, industry_trends, generated_at")
    .order("week_start", { ascending: false });

  const all = (digests ?? []) as DigestRow[];

  const yearsSet = new Set<string>();
  all.forEach((d) => yearsSet.add(format(new Date(d.week_start), "yyyy")));
  const years = Array.from(yearsSet).sort().reverse();

  const filtered = year && year !== "all"
    ? all.filter((d) => format(new Date(d.week_start), "yyyy") === year)
    : all;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-primary">
          Archive
        </p>
        <h1 className="font-display font-semibold text-[28px] tracking-[-0.018em] leading-[1.12] text-foreground">
          Every digest, in order
        </h1>
        <p className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "issue" : "issues"} published
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <YearChip href="/digests/archive" label="All" active={!year || year === "all"} />
        {years.map((y) => (
          <YearChip
            key={y}
            href={`/digests/archive?year=${y}`}
            label={y}
            active={year === y}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="h-5 w-5" />}
          title="No digests in this range yet"
          body="Weekly digests are generated every Monday at 6am UTC."
        />
      ) : (
        <ol className="rounded-[10px] border border-border bg-card overflow-hidden divide-y divide-border">
          {filtered.map((d) => {
            const start = new Date(d.week_start);
            const end = new Date(d.week_end);
            const range = `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
            const yr = format(start, "yyyy");
            const lede = d.global_summary?.key_insight ?? d.global_summary?.headline ?? "Weekly briefing";
            const signalCount = Math.min(
              5,
              (d.strategy_signals?.length ?? 0) + (d.industry_trends?.length ?? 0)
            );
            return (
              <li key={d.id}>
                <Link
                  href={`/digests/${d.id}`}
                  className="grid grid-cols-[140px_1fr_auto_24px] items-center gap-4 px-5 py-4 hover:bg-secondary transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{range}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground tabular-nums">
                      {yr}
                    </p>
                  </div>
                  <p className="text-sm text-foreground/80 line-clamp-2 leading-snug">
                    {lede}
                  </p>
                  <SignalPips count={signalCount} />
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function YearChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary-soft text-primary-soft-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-secondary"
      )}
    >
      {label}
    </Link>
  );
}

function SignalPips({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${count} signals`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i < count ? "bg-primary" : "bg-border"
          )}
        />
      ))}
    </div>
  );
}
