/**
 * Marketing landing page — public-facing root (`/`).
 *
 * Visual contract:
 * - Full-bleed coast gradient hero.
 * - Eyebrow uses `text-foreground` (NOT primary; verifier flagged contrast on gradient).
 * - Stats row, coverage list, and "read a sample" CTA.
 *
 * Auth behavior: signed-in users are redirected to `/dashboard` so existing
 * bookmarks for `/` keep landing on the app.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ArrowRight } from "lucide-react";
import { format } from "date-fns";

type CoverageRow = {
  name: string;
  country: string | null;
  scope: "strategic" | "templates" | "pending";
};

export default async function MarketingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const [{ count: companiesTracked }, { count: activeRolesThisWeek }, { data: companies }, { data: latestDigest }] =
    await Promise.all([
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("job_postings").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase
        .from("companies")
        .select("name, country, is_active")
        .eq("is_active", true)
        .order("name")
        .limit(24),
      supabase
        .from("weekly_digests")
        .select("id, week_start, week_end, global_summary")
        .order("week_start", { ascending: false })
        .limit(1)
        .single(),
    ]);

  const coverage: CoverageRow[] = (companies ?? []).map((c: { name: string; country: string | null }) => ({
    name: c.name,
    country: c.country,
    scope: "strategic" as const,
  }));

  const sampleQuote =
    latestDigest?.global_summary?.key_insight ??
    latestDigest?.global_summary?.headline ??
    "Five fintechs quietly built compliance teams this week. The pattern says more about regulator pressure than the companies do.";

  const sampleRange = latestDigest
    ? `${format(new Date(latestDigest.week_start), "MMM d")} – ${format(new Date(latestDigest.week_end), "MMM d")}`
    : "This week";

  return (
    <>
      {/* Hero */}
      <section
        className="relative overflow-hidden border-b border-border"
        style={{ background: "var(--gradient-coast)" }}
      >
        <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-foreground/70">
            The Fintech Talent Brief
          </p>
          <h1 className="mt-4 font-display font-semibold text-[44px] md:text-[64px] tracking-[-0.022em] leading-[1.06] max-w-[14ch] text-foreground">
            Decode hiring strategy.
          </h1>
          <p className="mt-5 max-w-[52ch] text-base md:text-lg text-foreground/80 leading-relaxed">
            A weekly analyst briefing on fintech hiring. Read the moves before the market does.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/login?mode=signup"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-pacific-600 transition-colors"
            >
              Get started free
              <ArrowRight className="h-4 w-4" />
            </Link>
            {latestDigest && (
              <Link
                href={`/digests/${latestDigest.id}`}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-6 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                Read a sample digest
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          <Stat label="Companies tracked" value={companiesTracked ?? 0} />
          <Stat label="Active roles" value={activeRolesThisWeek ?? 0} />
          <Stat label="Editorial cadence" value="Weekly" />
        </div>
      </section>

      {/* Sample pull-quote */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary mb-4">
            From {sampleRange}
          </p>
          <blockquote className="font-display text-[26px] md:text-[32px] leading-[1.28] tracking-[-0.014em] text-foreground">
            “{sampleQuote}”
          </blockquote>
        </div>
      </section>

      {/* Coverage */}
      <section>
        <div className="mx-auto max-w-6xl px-6 py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-primary mb-2">
            Coverage
          </p>
          <h2 className="font-display font-semibold text-[28px] tracking-[-0.018em] leading-[1.12] text-foreground mb-8">
            Tracked across the fintech market
          </h2>
          {coverage.length === 0 ? (
            <p className="text-sm text-muted-foreground">Coverage coming online soon.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
              {coverage.map((c) => (
                <li key={c.name} className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-foreground">{c.name}</span>
                  {c.country && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      {c.country}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-display text-[40px] tracking-[-0.018em] leading-none tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}
