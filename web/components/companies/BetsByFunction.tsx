/**
 * BetsByFunction — alternative view of a company's strategic bets, grouped
 * by the function each bet's hiring evidence falls under.
 *
 * Sibling to StrategicBetCard. Same data input as the "By bet" tab; we
 * re-shard the bets keyed on `bet.job_filter.function`. Each function group
 * shows:
 *   - the function-group dot + label + active job count
 *   - the bets whose job_filter.function matches (case-insensitive)
 *   - a "See {N} jobs in {group}" link that opens the drawer scoped to that group
 *
 * Bets without a function filter land in "Cross-cutting bets" at the bottom.
 * Function groups with active jobs but no bet attached render the count
 * with a "Mapped to no bet yet" hint.
 */

"use client";

import { ArrowRight, ArrowUpRight, Target } from "lucide-react";
import { ConfidenceBars, FunctionDot, PivotChip } from "@/components/design";
import type { CompanyBetWithJobs, CompanyBetJob } from "@/lib/dashboard-queries";
import { cn } from "@/lib/utils";

type AllJob = CompanyBetJob & { betId: string | null; betTitle: string | null };

const PIVOT_LABEL: Record<CompanyBetWithJobs["pivot"], string> = {
  new: "New direction",
  accel: "Accelerating",
  cont: "Continuity",
  quiet: "Hiring quiet",
};

export interface BetsByFunctionProps {
  bets: CompanyBetWithJobs[];
  allJobs: AllJob[];
  onOpenScope: (betId: string) => void;
  onOpenFunction: (functionName: string) => void;
}

interface Group {
  name: string;
  jobsCount: number;
  bets: CompanyBetWithJobs[];
}

function buildGroups(
  bets: CompanyBetWithJobs[],
  allJobs: AllJob[]
): { groups: Group[]; crossCutting: CompanyBetWithJobs[] } {
  const counts = new Map<string, number>();
  for (const j of allJobs) {
    if (!j.isActive) continue;
    const g = (j.functionGroup ?? j.functionCategory ?? "").trim();
    if (!g) continue;
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }

  const byFunction = new Map<string, CompanyBetWithJobs[]>();
  const crossCutting: CompanyBetWithJobs[] = [];

  for (const bet of bets) {
    const fn = bet.job_filter?.function?.trim();
    if (!fn) {
      crossCutting.push(bet);
      continue;
    }
    const key = fn;
    if (!byFunction.has(key)) byFunction.set(key, []);
    byFunction.get(key)!.push(bet);
  }

  const allKeys = new Set<string>([...counts.keys(), ...byFunction.keys()]);
  const groups: Group[] = Array.from(allKeys)
    .map((name) => ({
      name,
      jobsCount: counts.get(name) ?? findCountCaseInsensitive(counts, name),
      bets: byFunction.get(name) ?? [],
    }))
    .sort((a, b) => b.jobsCount - a.jobsCount || b.bets.length - a.bets.length);

  return { groups, crossCutting };
}

function findCountCaseInsensitive(map: Map<string, number>, name: string): number {
  const lower = name.toLowerCase();
  for (const [k, v] of map) {
    if (k.toLowerCase() === lower) return v;
  }
  return 0;
}

export function BetsByFunction({
  bets,
  allJobs,
  onOpenScope,
  onOpenFunction,
}: BetsByFunctionProps) {
  const { groups, crossCutting } = buildGroups(bets, allJobs);

  if (groups.length === 0 && crossCutting.length === 0) {
    return (
      <div className="rounded-[12px] border border-dashed border-border bg-muted/30 px-7 py-10 text-center">
        <p className="text-[13.5px] text-foreground/70">
          No function groups yet — neither bets nor active hiring evidence to
          group.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <FunctionGroupSection
          key={group.name}
          group={group}
          onOpenScope={onOpenScope}
          onOpenFunction={onOpenFunction}
        />
      ))}
      {crossCutting.length > 0 && (
        <div className="rounded-[12px] border border-border bg-card">
          <div className="flex items-baseline justify-between border-b border-border px-[22px] py-3.5">
            <div className="font-sans font-semibold text-foreground" style={{ fontSize: 14 }}>
              Cross-cutting bets
            </div>
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              No single function
            </span>
          </div>
          <div className="flex flex-col">
            {crossCutting.map((bet) => (
              <BetRow
                key={bet.id}
                bet={bet}
                onOpenScope={onOpenScope}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FunctionGroupSection({
  group,
  onOpenScope,
  onOpenFunction,
}: {
  group: Group;
  onOpenScope: (betId: string) => void;
  onOpenFunction: (functionName: string) => void;
}) {
  return (
    <div className="rounded-[12px] border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-[22px] py-3.5">
        <div className="flex items-center gap-2.5">
          <FunctionDot fn={group.name} />
          <div>
            <div
              className="font-sans font-semibold text-foreground"
              style={{ fontSize: 14, lineHeight: 1.2 }}
            >
              {group.name}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {group.jobsCount} active{" "}
              {group.jobsCount === 1 ? "role" : "roles"} ·{" "}
              {group.bets.length} {group.bets.length === 1 ? "bet" : "bets"}
            </div>
          </div>
        </div>
        {group.jobsCount > 0 && (
          <button
            type="button"
            onClick={() => onOpenFunction(group.name)}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-sans text-[11.5px] font-medium text-primary transition-colors hover:bg-primary-soft"
          >
            See {group.jobsCount}{" "}
            {group.jobsCount === 1 ? "role" : "roles"}
            <ArrowRight className="h-3 w-3" aria-hidden />
          </button>
        )}
      </div>
      {group.bets.length === 0 ? (
        <div className="px-[22px] py-4 text-[12.5px] italic text-muted-foreground">
          {group.jobsCount} active{" "}
          {group.jobsCount === 1 ? "role" : "roles"} mapped to no bet yet.
          Author a bet so the hiring has a thesis to attach to.
        </div>
      ) : (
        <div className="flex flex-col">
          {group.bets.map((bet) => (
            <BetRow key={bet.id} bet={bet} onOpenScope={onOpenScope} />
          ))}
        </div>
      )}
    </div>
  );
}

function BetRow({
  bet,
  onOpenScope,
}: {
  bet: CompanyBetWithJobs;
  onOpenScope: (betId: string) => void;
}) {
  const pivotLabel = bet.pivot_label?.trim() || PIVOT_LABEL[bet.pivot];
  return (
    <button
      type="button"
      onClick={() => onOpenScope(bet.id)}
      className={cn(
        "group grid w-full grid-cols-[1fr_auto] items-start gap-4 border-t border-border px-[22px] py-3.5 text-left transition-colors first:border-t-0 hover:bg-muted/40"
      )}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className="font-sans font-semibold text-foreground transition-colors group-hover:text-primary"
            style={{ fontSize: 15, lineHeight: 1.25 }}
          >
            {bet.title}
          </span>
          <PivotChip kind={bet.pivot} label={pivotLabel} />
        </div>
        <p
          className="m-0 max-w-[60ch] text-foreground/70"
          style={{ fontSize: 13, lineHeight: 1.5 }}
        >
          {bet.claim}
        </p>
        {bet.forward_signal && (
          <div
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-accent-soft px-2 py-1"
            style={{ fontSize: 11.5, lineHeight: 1.3 }}
          >
            <Target
              className="h-3 w-3 text-accent-soft-foreground"
              aria-hidden
            />
            <span className="text-accent-soft-foreground/85">
              {bet.forward_signal}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span className="font-sans text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
          Confidence
        </span>
        <ConfidenceBars value={bet.confidence} />
        <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
          {bet.jobsCount} {bet.jobsCount === 1 ? "job" : "jobs"}
          <ArrowUpRight
            className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </span>
      </div>
    </button>
  );
}
