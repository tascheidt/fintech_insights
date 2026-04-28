/**
 * Companies — editorial signal-rich list (Wave 2 v2 redesign).
 *
 * Rewrites the old grid table as a single-row-per-company editorial table
 * where every row hints at the working thesis and what the company's
 * hiring is signalling this week.
 *
 * Reference: /tmp/design-package-v2/.../CompaniesIndex_v2.jsx
 *
 * Page contract:
 * - Editorial header with eyebrow ("{n} tracked · weekly research") + Fraunces title.
 * - Toolbar with `?lens=` segmented control + `?view=` Signal/Directory toggle.
 * - 5-column grid table (4px / 320px / 1fr / 220px / 240px).
 * - Continuity divider when view === "signal" AND lens === "all".
 * - Footer: synced timestamp + strip color legend.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Download, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import {
  classifyCompanyPivot,
  getCompanyHiringDelta,
  getCompanyHiringSparkline,
  getCompanyLastChange,
  type PivotKind,
} from "@/lib/dashboard-queries";
import { CompaniesIndexRow, type CompanyRow } from "@/components/companies/CompaniesIndexRow";
import { CompaniesLens, type LensKey } from "@/components/companies/CompaniesLens";
import { CompaniesViewToggle, type ViewKey } from "@/components/companies/CompaniesViewToggle";

const LENS_KEYS: LensKey[] = ["all", "new", "accel", "quiet", "cont"];
const VIEW_KEYS: ViewKey[] = ["signal", "alpha"];
const STATUS_PRIORITY: Record<PivotKind, number> = {
  new: 0,
  accel: 1,
  quiet: 2,
  cont: 3,
};

function parseLens(raw: string | string[] | undefined): LensKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (LENS_KEYS as string[]).includes(v ?? "") ? (v as LensKey) : "all";
}

function parseView(raw: string | string[] | undefined): ViewKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (VIEW_KEYS as string[]).includes(v ?? "") ? (v as ViewKey) : "signal";
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const lens = parseLens(params.lens);
  const view = parseView(params.view);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const canEdit = ["editor", "admin"].includes(profile?.role ?? "");

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, slug, country, thesis, last_change, last_change_at, last_collected_at")
    .eq("is_active", true)
    .order("name");

  const list = companies ?? [];

  if (list.length === 0) {
    return (
      <div className="space-y-6">
        <CompaniesHeader count={0} canEdit={canEdit} />
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title="Pick the companies you want to watch"
          body="The Talent Brief tracks fintech companies of your choosing. Add the first to start collecting hiring signals."
          primaryAction={canEdit ? { label: "Add company", href: "/companies/add" } : undefined}
        />
      </div>
    );
  }

  const ids = list.map((c) => c.id);
  const { data: jobs } = await supabase
    .from("job_postings")
    .select("company_id")
    .eq("is_active", true)
    .in("company_id", ids);

  const jobsByCompany = new Map<string, number>();
  for (const j of jobs ?? []) {
    jobsByCompany.set(j.company_id, (jobsByCompany.get(j.company_id) ?? 0) + 1);
  }

  // Per-company editorial signals (small N — ≤30 companies per CLAUDE.md).
  const rows: CompanyRow[] = await Promise.all(
    list.map(async (c) => {
      const [spark, delta, pivot, dbLastChange] = await Promise.all([
        getCompanyHiringSparkline(c.id, 8),
        getCompanyHiringDelta(c.id, 30),
        classifyCompanyPivot(c.id),
        getCompanyLastChange(c.id),
      ]);

      const lastChange = c.last_change
        ? {
            text: c.last_change as string,
            when: c.last_change_at
              ? formatDistanceToNow(new Date(c.last_change_at as string), {
                  addSuffix: false,
                })
              : "—",
          }
        : dbLastChange;

      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        hq: (c.country ?? "—") as string,
        thesis: (c.thesis as string | null) ?? null,
        jobs: jobsByCompany.get(c.id) ?? 0,
        spark,
        delta,
        signals: pivot.signals,
        lastChange,
        status: pivot.kind,
      };
    })
  );

  const counts: Record<LensKey, number> = {
    all: rows.length,
    new: 0,
    accel: 0,
    quiet: 0,
    cont: 0,
  };
  for (const r of rows) counts[r.status] += 1;

  const filtered = lens === "all" ? rows : rows.filter((r) => r.status === lens);
  const sorted =
    view === "signal"
      ? [...filtered].sort(
          (a, b) =>
            STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] ||
            a.name.localeCompare(b.name)
        )
      : [...filtered].sort((a, b) => a.name.localeCompare(b.name));

  const splitIdx =
    view === "signal" && lens === "all"
      ? sorted.findIndex((r) => r.status === "cont")
      : -1;

  const lastSync = list
    .map((c) => (c.last_collected_at ? new Date(c.last_collected_at as string) : null))
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const syncedLabel = lastSync
    ? `Synced ${formatDistanceToNow(lastSync, { addSuffix: true })} · next research pass tomorrow 06:00 ET`
    : "Awaiting first research pass";

  return (
    <div className="space-y-5">
      <CompaniesHeader count={list.length} canEdit={canEdit} />

      {/* Toolbar — wraps to two rows on mobile, side-by-side at sm+. Each
          control is in its own scroll container so a long lens (or future
          extra tabs) doesn't push the page wider than the viewport. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3.5">
        <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <CompaniesLens active={lens} counts={counts} />
        </div>
        <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <CompaniesViewToggle active={view} />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Header row — desktop grid only. Mobile rows are vertical cards
            with their own labels, so column headers would just clutter. */}
        <div
          className="hidden items-center gap-[18px] border-b border-border bg-secondary/70 py-2.5 pr-[22px] font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground sm:grid"
          style={{ gridTemplateColumns: "4px 320px 1fr 220px 240px" }}
        >
          <div />
          <div>Company · thesis</div>
          <div />
          <div>30d activity</div>
          <div>Active signals · last change</div>
        </div>

        {sorted.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            No companies in this lens this week.
          </div>
        ) : (
          sorted.map((row, i) => (
            <div key={row.id}>
              {i === splitIdx && (
                <div className="flex items-center gap-3 border-b border-border bg-secondary/70 px-[22px] py-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <span>Continuity · no inflection this week</span>
                </div>
              )}
              <CompaniesIndexRow row={row} />
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-1.5 text-[11.5px] leading-[1.5] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>{syncedLabel}</span>
        <span>
          Strip ·{" "}
          <span className="font-semibold text-highlight">coral = new</span> ·{" "}
          <span className="font-semibold text-sun-700">yellow = accelerating</span> ·{" "}
          <span className="font-semibold text-sand-500">grey = quiet</span>
        </span>
      </div>
    </div>
  );
}

function CompaniesHeader({ count, canEdit }: { count: number; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase leading-none tracking-[0.09em] text-muted-foreground">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full bg-highlight"
          />
          {count} tracked · weekly research
        </div>
        <h1 className="m-0 mb-2 font-display text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground">
          Companies
        </h1>
        <p className="m-0 max-w-[60ch] text-[13.5px] leading-[1.55] text-sand-700">
          Every fintech we cover, with the working thesis and what their hiring
          is signalling this week. Click a company to read the full strategic
          brief.
        </p>
      </div>
      {canEdit && (
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" asChild>
            <Link href="/companies?export=1">
              <Download className="h-3.5 w-3.5" /> Export
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/companies/add">
              <Plus className="h-3.5 w-3.5" /> Add company
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
