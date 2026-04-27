/**
 * JobsScopeDrawer — right-side panel that lets the reader inspect the
 * jobs behind a strategic bet without leaving the company drill-down.
 *
 * Three view modes:
 *   - "scope": jobs filtered to a single bet (with an "Expand to all
 *              companies" cross-link that pivots to /jobs?theme=…)
 *   - "all":   every active job at this company, each tagged with the
 *              bet it falls under (or "Not mapped to a bet")
 *   - "job":   a single job's detail view, with a "Back to bet" button
 *              when entered from a scope view
 *
 * Reference: shared-drawer.jsx in
 * /tmp/design-package-v2/rethink-jobs-and-companies-pages/project/shared-drawer.jsx
 */

"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  ExternalLink,
  Layers,
  SearchX,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FunctionDot, MonogramAvatar, SignalTag } from "@/components/design";
import type { CompanyBetJob, CompanyBetWithJobs } from "@/lib/dashboard-queries";
import { cn } from "@/lib/utils";

export type DrawerView =
  | { kind: "scope"; betId: string }
  | { kind: "all" }
  | { kind: "job"; jobId: string; betId?: string }
  | null;

type AllJob = CompanyBetJob & { betId: string | null; betTitle: string | null };

export interface JobsScopeDrawerProps {
  open: boolean;
  view: DrawerView;
  onClose: () => void;
  onSetView: (next: DrawerView) => void;
  companyName: string;
  companySlug: string;
  bets: CompanyBetWithJobs[];
  allJobs: AllJob[];
}

export function JobsScopeDrawer({
  open,
  view,
  onClose,
  onSetView,
  companyName,
  companySlug,
  bets,
  allJobs,
}: JobsScopeDrawerProps) {
  const router = useRouter();

  const betById = useMemo(() => {
    const m = new Map<string, CompanyBetWithJobs>();
    for (const b of bets) m.set(b.id, b);
    return m;
  }, [bets]);

  function handleOpenChange(next: boolean) {
    if (!next) onClose();
  }

  if (!view) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-[560px]">
          <SheetHeader>
            <SheetTitle className="sr-only">Jobs panel</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  // Compute header
  let eyebrow = "";
  let title = "";
  let sub = "";
  if (view.kind === "scope") {
    const bet = betById.get(view.betId);
    eyebrow = "JOBS · scoped to bet";
    title = bet?.title ?? "Strategic bet";
    sub = `Active postings staffing this strategic bet at ${companyName}. Click any job for the JD excerpt.`;
  } else if (view.kind === "all") {
    eyebrow = "JOBS · all open";
    title = `All open roles at ${companyName}`;
    sub = `${allJobs.length} active postings across mapped bets and unmapped roles.`;
  } else {
    eyebrow = "JOB · evidence detail";
    title = "";
    sub = "";
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      >
        {/* Header */}
        <SheetHeader className="border-b border-border p-0">
          <div className="flex items-start gap-3 px-[22px] py-4">
            <div className="flex-1">
              <div className="mb-1.5 font-sans text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                {eyebrow}
              </div>
              {view.kind !== "job" && (
                <SheetTitle
                  className="m-0 font-sans font-semibold text-foreground"
                  style={{
                    fontSize: 17,
                    lineHeight: 1.3,
                    letterSpacing: "-0.01em",
                    textWrap: "pretty",
                  }}
                >
                  {title}
                </SheetTitle>
              )}
              {view.kind === "job" && (
                <SheetTitle className="sr-only">Job evidence detail</SheetTitle>
              )}
              {sub && view.kind !== "job" && (
                <p className="mt-1.5 m-0 text-[12.5px] leading-[1.5] text-foreground/70">
                  {sub}
                </p>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {view.kind === "scope" && (
            <ScopeBody
              bet={betById.get(view.betId)}
              companyName={companyName}
              onJobClick={(jobId) =>
                onSetView({ kind: "job", jobId, betId: view.betId })
              }
              onSeeAll={() => onSetView({ kind: "all" })}
              onExpandTheme={() => {
                const bet = betById.get(view.betId);
                const theme =
                  bet?.job_filter?.theme ?? bet?.job_filter?.function ?? "";
                router.push(
                  theme
                    ? `/jobs?theme=${encodeURIComponent(theme)}`
                    : "/jobs"
                );
              }}
              onClearBet={() => onSetView({ kind: "all" })}
            />
          )}

          {view.kind === "all" && (
            <AllBody
              companyName={companyName}
              allJobs={allJobs}
              onJobClick={(jobId, betId) =>
                onSetView({ kind: "job", jobId, betId })
              }
            />
          )}

          {view.kind === "job" && (
            <JobBody
              jobId={view.jobId}
              betId={view.betId}
              bets={bets}
              allJobs={allJobs}
              companySlug={companySlug}
              onBack={() =>
                view.betId
                  ? onSetView({ kind: "scope", betId: view.betId })
                  : onSetView({ kind: "all" })
              }
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Scope body
// ---------------------------------------------------------------------------

function ScopeBody({
  bet,
  companyName,
  onJobClick,
  onSeeAll,
  onExpandTheme,
  onClearBet,
}: {
  bet: CompanyBetWithJobs | undefined;
  companyName: string;
  onJobClick: (jobId: string) => void;
  onSeeAll: () => void;
  onExpandTheme: () => void;
  onClearBet: () => void;
}) {
  const jobs = bet?.jobs ?? [];

  return (
    <div className="flex h-full flex-col">
      <FilterStrip>
        <FilterChip
          label={`Bet · ${bet?.title ?? "—"}`}
          onRemove={onClearBet}
        />
        <FilterChip label={`Company · ${companyName}`} />
        <button
          type="button"
          onClick={onExpandTheme}
          className="ml-auto inline-flex items-center gap-1 font-sans text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
        >
          Expand to all companies
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </button>
      </FilterStrip>

      <div className="flex-1 overflow-y-auto px-0 pb-6 pt-1">
        {jobs.length === 0 ? (
          <div className="px-[22px] py-10 text-center text-[13px] text-muted-foreground">
            <SearchX
              className="mx-auto mb-2 h-6 w-6 text-muted-foreground"
              aria-hidden
            />
            <div className="text-foreground">
              <strong>No jobs match this bet.</strong>
            </div>
            <p className="mx-auto mt-1 max-w-[32ch]">
              That&rsquo;s the signal. Public materials hint at this direction
              but no hiring evidence supports it yet.
            </p>
          </div>
        ) : (
          jobs.map((j) => (
            <JobRow key={j.id} job={j} onClick={() => onJobClick(j.id)} />
          ))
        )}
        {jobs.length > 0 && (
          <button
            type="button"
            onClick={onSeeAll}
            className="mx-[22px] mt-4 flex items-center gap-2.5 rounded-lg border border-dashed border-border bg-muted/40 px-3.5 py-3 text-left text-[12px] leading-[1.4] text-foreground/70 transition-colors hover:border-primary hover:bg-primary-soft/40 hover:text-primary"
          >
            <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              <strong className="font-semibold text-foreground">
                See all {companyName} postings
              </strong>{" "}
              across all bets and unmapped roles.
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// All body
// ---------------------------------------------------------------------------

function AllBody({
  companyName,
  allJobs,
  onJobClick,
}: {
  companyName: string;
  allJobs: AllJob[];
  onJobClick: (jobId: string, betId: string | undefined) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <FilterStrip>
        <FilterChip label={`Company · ${companyName}`} />
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {allJobs.length} active
        </span>
      </FilterStrip>

      <div className="flex-1 overflow-y-auto pb-6 pt-1">
        {allJobs.length === 0 ? (
          <div className="px-[22px] py-10 text-center text-[13px] text-muted-foreground">
            No active jobs.
          </div>
        ) : (
          allJobs.map((j) => (
            <JobRow
              key={j.id}
              job={j}
              betLabel={j.betTitle ?? "Not mapped to a bet"}
              betUnmapped={!j.betId}
              onClick={() => onJobClick(j.id, j.betId ?? undefined)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Job detail body
// ---------------------------------------------------------------------------

function JobBody({
  jobId,
  betId,
  bets,
  allJobs,
  companySlug,
  onBack,
}: {
  jobId: string;
  betId: string | undefined;
  bets: CompanyBetWithJobs[];
  allJobs: AllJob[];
  companySlug: string;
  onBack: () => void;
}) {
  const fromBet = betId ? bets.find((b) => b.id === betId) : undefined;
  const job =
    (fromBet?.jobs.find((j) => j.id === jobId) as CompanyBetJob | undefined) ??
    allJobs.find((j) => j.id === jobId);

  if (!job) {
    return (
      <div className="px-[22px] py-10 text-center text-[13px] text-muted-foreground">
        Job not found.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-[22px] pt-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-sans text-[11.5px] font-medium text-primary transition-colors hover:bg-primary-soft/40"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          {betId ? "Back to bet" : "Back to all jobs"}
        </button>
      </div>

      <div className="px-[22px] pb-6 pt-3">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          {job.keywords.slice(0, 4).map((k) => (
            <SignalTag key={k}>{k}</SignalTag>
          ))}
          {job.isNew && (
            <span className="inline-flex items-center rounded-full bg-highlight-soft px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-highlight-soft-foreground">
              new
            </span>
          )}
        </div>
        <h2
          className="m-0 font-display font-semibold text-foreground"
          style={{
            fontSize: 22,
            lineHeight: 1.25,
            letterSpacing: "-0.015em",
          }}
        >
          {job.title}
        </h2>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <DetailField label="Function" value={job.functionGroup ?? job.functionCategory ?? "—"} />
          <DetailField label="Location" value={job.location ?? "—"} />
          <DetailField label="Posted" value={job.ageLabel === "today" ? "today" : `${job.ageLabel} ago`} />
          <DetailField label="Salary band" value="—" />
        </dl>

        {fromBet && (
          <section className="mt-5 border-t border-border pt-4">
            <h4 className="mb-1.5 font-sans text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
              Why this is evidence
            </h4>
            <p
              className="m-0 max-w-[60ch] text-[12.5px] leading-[1.55] text-foreground/85"
            >
              Tagged under <strong>{fromBet.title}</strong>
              {job.keywords.length > 0 && (
                <>
                  {" "}because the JD uses signal terms (
                  {job.keywords.slice(0, 4).join(", ")}) and the function
                  pattern matches the inferred direction.
                </>
              )}
              {job.keywords.length === 0 && (
                <>
                  {" "}because the role&rsquo;s function and title align with
                  this bet&rsquo;s filter.
                </>
              )}
            </p>
          </section>
        )}

        <div className="mt-5 flex items-center gap-3">
          <a
            href={job.url ?? `/companies/${companySlug}/jobs/${job.id}`}
            target={job.url ? "_blank" : undefined}
            rel={job.url ? "noreferrer" : undefined}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-sans text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            View full posting
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-sans text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 m-0 font-sans text-[13px] text-foreground">
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function FilterStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/40 px-[22px] py-3">
      <span className="mr-1 font-sans text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
        Filtered to
      </span>
      {children}
    </div>
  );
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-2.5 pr-1 font-sans text-[11px] font-medium text-foreground/85">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80"
          aria-label="Remove filter"
        >
          <X className="h-2 w-2" aria-hidden />
        </button>
      )}
    </span>
  );
}

function JobRow({
  job,
  betLabel,
  betUnmapped,
  onClick,
}: {
  job: CompanyBetJob;
  betLabel?: string;
  betUnmapped?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "grid w-full grid-cols-[1fr_80px_60px_18px] items-center gap-3 border-b border-border px-[22px] py-3 text-left transition-colors hover:bg-muted/40"
      )}
    >
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <MonogramAvatar size="sm" name={job.title} />
          <span className="font-sans text-[13px] font-medium leading-[1.35] text-foreground">
            {job.title}
          </span>
          {job.keywords.slice(0, 2).map((k) => (
            <SignalTag key={k}>{k}</SignalTag>
          ))}
        </div>
        <div className="mt-1 flex items-center gap-1.5 font-sans text-[11.5px] leading-[1.3] text-muted-foreground">
          {job.functionGroup && <FunctionDot fn={job.functionGroup} />}
          <span>
            {betLabel ? (
              <>
                <span
                  className={cn(
                    "font-medium",
                    betUnmapped
                      ? "italic text-muted-foreground"
                      : "text-primary"
                  )}
                >
                  {betLabel}
                </span>
                {" · "}
                {job.location ?? "—"}
              </>
            ) : (
              <>
                {job.functionGroup ?? job.functionCategory ?? "—"} ·{" "}
                {job.location ?? "—"}
                {job.isNew ? " · new" : ""}
              </>
            )}
          </span>
        </div>
      </div>
      <div className="font-sans text-[11.5px] font-medium text-muted-foreground">
        {job.functionGroup ?? job.functionCategory ?? "—"}
      </div>
      <div className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {job.ageLabel}
      </div>
      <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden />
    </button>
  );
}
