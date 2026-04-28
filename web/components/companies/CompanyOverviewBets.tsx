/**
 * CompanyOverviewBets — client wrapper that owns the drawer state for the
 * company drill-down. Renders:
 *   - the "active postings" context pill (in the page header)
 *   - the section header with the "All jobs (N)" tab
 *   - the bet cards (or empty state)
 *   - the JobsScopeDrawer
 *
 * The page.tsx server component does all the data fetching and passes
 * shaped props in.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Briefcase } from "lucide-react";
import { StrategicBetCard } from "./StrategicBetCard";
import { BetsByFunction } from "./BetsByFunction";
import { JobsScopeDrawer, type DrawerView } from "./JobsScopeDrawer";
import { COMPANY_DRAWER_OPEN_EVENT } from "./CompanyHeaderPill";
import { cn } from "@/lib/utils";
import type { CompanyBetWithJobs, CompanyBetJob } from "@/lib/dashboard-queries";

type AllJob = CompanyBetJob & { betId: string | null; betTitle: string | null };
type Tab = "bet" | "function";

export interface CompanyOverviewBetsProps {
  companyName: string;
  companySlug: string;
  bets: CompanyBetWithJobs[];
  allJobs: AllJob[];
  activeJobCount: number;
}

export function CompanyOverviewBets({
  companyName,
  companySlug,
  bets,
  allJobs,
  activeJobCount,
}: CompanyOverviewBetsProps) {
  const [view, setView] = useState<DrawerView>(null);
  const [tab, setTab] = useState<Tab>("bet");

  const open = view !== null;
  const close = () => setView(null);

  useEffect(() => {
    function onOpenAll() {
      setView({ kind: "all" });
    }
    window.addEventListener(COMPANY_DRAWER_OPEN_EVENT, onOpenAll);
    return () =>
      window.removeEventListener(COMPANY_DRAWER_OPEN_EVENT, onOpenAll);
  }, []);

  return (
    <>
      <SectionHeader
        tab={tab}
        onTabChange={setTab}
        activeJobCount={activeJobCount}
        onAllJobsClick={() => setView({ kind: "all" })}
      />

      {bets.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border bg-muted/30 px-7 py-10 text-center">
          <h3 className="font-display text-[20px] font-semibold text-foreground">
            No strategic bets recorded yet.
          </h3>
          <p className="mx-auto mt-2 max-w-[60ch] text-[13.5px] leading-[1.55] text-foreground/70">
            Add 2&ndash;6 bets so the hiring evidence has a thesis to attach
            to. The strongest bets are the ones a competitor would dispute.
          </p>
          <Link
            href={`/companies/${companySlug}?edit=1`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-sans text-[12px] font-medium text-primary transition-colors hover:bg-primary-soft/40"
          >
            Add a bet
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      ) : tab === "bet" ? (
        <div className="flex flex-col gap-3.5">
          {bets.map((bet) => (
            <StrategicBetCard
              key={bet.id}
              bet={bet}
              onOpenScope={(betId) => setView({ kind: "scope", betId })}
              onOpenJob={(betId, jobId) =>
                setView({ kind: "job", betId, jobId })
              }
            />
          ))}
        </div>
      ) : (
        <BetsByFunction
          bets={bets}
          allJobs={allJobs}
          onOpenScope={(betId) => setView({ kind: "scope", betId })}
          onOpenFunction={(functionName) =>
            setView({ kind: "function", functionName })
          }
        />
      )}

      <JobsScopeDrawer
        open={open}
        view={view}
        onClose={close}
        onSetView={setView}
        companyName={companyName}
        companySlug={companySlug}
        bets={bets}
        allJobs={allJobs}
      />
    </>
  );
}

function SectionHeader({
  tab,
  onTabChange,
  activeJobCount,
  onAllJobsClick,
}: {
  tab: Tab;
  onTabChange: (next: Tab) => void;
  activeJobCount: number;
  onAllJobsClick: () => void;
}) {
  return (
    <div className="mb-3.5 mt-6 flex items-baseline justify-between gap-4">
      <div>
        <div
          className="font-sans font-semibold text-foreground"
          style={{ fontSize: 16, lineHeight: 1, letterSpacing: "-0.01em" }}
        >
          Strategic bets, ranked by hiring evidence
        </div>
        <div className="mt-1 font-sans text-[12px] text-muted-foreground">
          {tab === "bet"
            ? "Click any bet title to see the jobs staffing it. Each card opens in a side panel so you don’t lose the thesis."
            : "Bets re-grouped by the function their hiring evidence falls under. Useful for seeing where you have evidence — and where you don’t."}
        </div>
      </div>
      <div
        className="hidden items-center gap-1 sm:flex"
        role="tablist"
        aria-label="Bets view"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "bet"}
          onClick={() => onTabChange("bet")}
          className={cn(
            "rounded-md px-2 py-1 font-sans text-[11px] font-medium transition-colors",
            tab === "bet"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/60"
          )}
        >
          By bet
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "function"}
          onClick={() => onTabChange("function")}
          className={cn(
            "rounded-md px-2 py-1 font-sans text-[11px] font-medium transition-colors",
            tab === "function"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/60"
          )}
        >
          By function
        </button>
        <button
          type="button"
          onClick={onAllJobsClick}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-sans text-[11px] font-medium text-primary transition-colors hover:bg-primary-soft/40"
        >
          <Briefcase className="h-3 w-3" aria-hidden />
          All jobs ({activeJobCount})
        </button>
      </div>
    </div>
  );
}
