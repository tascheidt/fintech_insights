/**
 * StrategicBetCard — single bet on the company drill-down.
 *
 * Bundles a claim, evidence (internal + external), associated jobs, and a
 * forward signal. Title and "{N} jobs" header chip both open the scoped
 * jobs drawer; individual job rows open the same drawer in single-job
 * mode. The card stays hover-only — the surrounding page is not the click
 * target.
 *
 * Reference: `dirA-bet*` rules in
 * /tmp/design-package-v2/rethink-jobs-and-companies-pages/project/extra-styles.css
 */

"use client";

import { ArrowRight, ArrowUpRight, Briefcase, Newspaper, Plus, Target } from "lucide-react";
import { ConfidenceBars, PivotChip, SignalTag } from "@/components/design";
import type { CompanyBetWithJobs } from "@/lib/dashboard-queries";
import { cn } from "@/lib/utils";

const PIVOT_LABEL: Record<CompanyBetWithJobs["pivot"], string> = {
  new: "New direction",
  accel: "Accelerating",
  cont: "Continuity",
  quiet: "Hiring quiet",
};

export interface StrategicBetCardProps {
  bet: CompanyBetWithJobs;
  onOpenScope: (betId: string) => void;
  onOpenJob: (betId: string, jobId: string) => void;
}

export function StrategicBetCard({
  bet,
  onOpenScope,
  onOpenJob,
}: StrategicBetCardProps) {
  const visibleJobs = bet.jobs.slice(0, 3);
  const remaining = bet.jobsCount - visibleJobs.length;

  const pivotLabel = bet.pivot_label?.trim() || PIVOT_LABEL[bet.pivot];

  return (
    <div className="overflow-hidden rounded-[12px] border border-border bg-card transition-shadow hover:shadow-sm">
      {/* Head */}
      <div className="grid grid-cols-[1fr_auto] items-start gap-4 border-b border-border px-[22px] py-[18px]">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onOpenScope(bet.id)}
              className="group inline-flex items-center gap-1.5 text-left font-sans font-semibold text-foreground transition-colors hover:text-primary"
              style={{
                fontSize: 18,
                lineHeight: 1.25,
                letterSpacing: "-0.01em",
              }}
            >
              {bet.title}
              <ArrowUpRight
                className="h-[14px] w-[14px] text-primary opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                aria-hidden
              />
            </button>
            <PivotChip kind={bet.pivot} label={pivotLabel} />
          </div>
          <p
            className="m-0 max-w-[72ch] text-foreground/70"
            style={{ fontSize: 13.5, lineHeight: 1.55, textWrap: "pretty" }}
          >
            {bet.claim}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="font-sans text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            Confidence
          </span>
          <ConfidenceBars value={bet.confidence} />
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 sm:grid-cols-[240px_1fr]">
        {/* Evidence */}
        <div className="border-b border-border bg-muted/40 px-5 py-4 sm:border-b-0 sm:border-r">
          <div className="mb-2.5 font-sans text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
            Evidence ({bet.evidence.length})
          </div>
          {bet.evidence.length === 0 ? (
            <p className="text-[12px] italic text-muted-foreground">
              No evidence captured yet.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {bet.evidence.map((e, i) => {
                const Icon = e.type === "external" ? Newspaper : Briefcase;
                return (
                  <li
                    key={i}
                    className="grid grid-cols-[14px_1fr] items-start gap-2"
                  >
                    <Icon
                      className="mt-[3px] h-3 w-3 text-muted-foreground"
                      aria-hidden
                    />
                    <div
                      className="text-foreground/85"
                      style={{ fontSize: 12, lineHeight: 1.45 }}
                    >
                      <span className="block font-mono text-[10.5px] text-muted-foreground">
                        {e.when}
                      </span>
                      {e.text}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Jobs under this bet */}
        <div className="py-1">
          <div className="flex items-baseline justify-between px-[22px] pb-2 pt-3">
            <span className="font-sans text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
              Hiring under this bet
            </span>
            {bet.jobsCount > 0 ? (
              <button
                type="button"
                onClick={() => onOpenScope(bet.id)}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-sans text-[11.5px] font-medium text-primary transition-colors hover:bg-primary-soft"
              >
                {bet.jobsCount} jobs
                <ArrowRight className="h-3 w-3" aria-hidden />
              </button>
            ) : (
              <span className="font-sans text-[11px] italic text-muted-foreground">
                0 jobs — that&rsquo;s the signal
              </span>
            )}
          </div>

          {bet.jobsCount === 0 ? (
            <div className="px-[22px] pb-6 pt-2 text-[13px] italic text-muted-foreground">
              No active jobs map to this bet. That gap is itself a signal —
              compare with the public statements above.
            </div>
          ) : (
            visibleJobs.map((j) => (
              <button
                key={j.id}
                type="button"
                onClick={() => onOpenJob(bet.id, j.id)}
                className={cn(
                  "grid w-full grid-cols-[1fr_80px_100px_60px_28px] items-center gap-3.5 border-t border-border px-[22px] py-2 text-left transition-colors hover:bg-muted/40"
                )}
              >
                <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                  <span>{j.title}</span>
                  {j.isNew && (
                    <span className="inline-flex items-center rounded-full bg-highlight-soft px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-highlight-soft-foreground">
                      new
                    </span>
                  )}
                  {j.keywords.slice(0, 2).map((k) => (
                    <SignalTag key={k}>{k}</SignalTag>
                  ))}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {j.functionGroup ?? j.functionCategory ?? "—"}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {j.location ?? "—"}
                </div>
                <div className="text-right font-mono text-[11.5px] tabular-nums text-muted-foreground">
                  {j.ageLabel}
                </div>
                <ArrowUpRight
                  className="h-[13px] w-[13px] justify-self-end text-muted-foreground"
                  aria-hidden
                />
              </button>
            ))
          )}

          {remaining > 0 && (
            <button
              type="button"
              onClick={() => onOpenScope(bet.id)}
              className="flex w-full items-center gap-1.5 border-t border-border px-[22px] py-2.5 font-sans text-[12px] font-medium text-primary transition-colors hover:bg-primary-soft/40"
            >
              <Plus className="h-2.5 w-2.5" aria-hidden /> {remaining} more
              under this bet
            </button>
          )}
        </div>
      </div>

      {/* Forward signal strip */}
      {bet.forward_signal && (
        <div
          className="flex items-center gap-2.5 border-t border-border bg-accent-soft px-[22px] py-2.5"
          style={{ fontSize: 12, lineHeight: 1.4 }}
        >
          <Target
            className="h-[13px] w-[13px] text-accent-soft-foreground"
            aria-hidden
          />
          <strong className="font-semibold text-accent-soft-foreground">
            Forward signal:
          </strong>
          <span className="text-accent-soft-foreground/85">
            {bet.forward_signal}
          </span>
        </div>
      )}
    </div>
  );
}
