/**
 * CompaniesIndexRow — single row of the editorial Companies index table.
 *
 * Five columns (matches the page-level grid template):
 *   [coverage strip] [company · thesis] [30d activity] [signals · last]
 *
 * Pure presentational; the parent server component fetches data and the
 * lens / view layer determines order + filtering.
 *
 * Reference: row block in
 * /tmp/design-package-v2/.../CompaniesIndex_v2.jsx
 */
import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  CoverageStrip,
  MonogramAvatar,
  PivotChip,
  Sparkline,
  type PivotKind,
} from "@/components/design";
import { TierBadge } from "@/components/ui/TierBadge";

export type CompanyRowSignal = { kind: PivotKind; label: string };

export type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  hq: string; // city or country code; rendered uppercase
  thesis: string | null;
  jobs: number;
  spark: number[];
  delta: number;
  signals: CompanyRowSignal[];
  lastChange: { text: string; when: string } | null;
  status: PivotKind;
  /**
   * Company tier. `incumbent` rows render a quieter variant: neutral
   * coverage strip, a TierBadge, no sparkline/delta, no PivotChips
   * (Phase 2 spec §Surface 4). Defaults to fintech when omitted.
   */
  tier?: "fintech" | "incumbent";
};

/**
 * Render markdown-style italics (`*phrase*`) inside a thesis string as
 * proper `<em>` nodes. Intentionally tiny — no library, no nesting,
 * no escapes. Matches the v2 mock's `{ em: "phrase" }` parts shape.
 */
function renderThesis(thesis: string | null): React.ReactNode {
  if (!thesis) return null;
  const parts = thesis.split(/(\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={i} className="font-medium italic text-foreground">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

const DELTA_COLOR = (delta: number): string => {
  if (delta > 0) return "text-growth-500";
  if (delta < 0) return "text-sunset-700";
  return "text-muted-foreground";
};

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return "±0";
}

export interface CompaniesIndexRowProps {
  row: CompanyRow;
}

export function CompaniesIndexRow({ row }: CompaniesIndexRowProps) {
  const isIncumbent = row.tier === "incumbent";
  const isCont = row.status === "cont";
  return (
    <Link
      href={`/companies/${row.slug}`}
      className={cn(
        "group grid cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-sand-100",
        // Mobile + tablet: 4px strip + content column, items align top.
        // Desktop (lg+): the original 5-col table grid. Below 1024px the
        // Active-signals column (240px) collides with the thesis column
        // and gets clipped by the wrapping `overflow-hidden` table.
        "grid-cols-[4px_1fr] items-stretch gap-x-3 gap-y-2 py-3.5 pl-0 pr-4",
        "lg:[grid-template-columns:4px_320px_1fr_220px_240px] lg:items-center lg:gap-x-[18px] lg:gap-y-0 lg:pr-[22px]",
        // Incumbent rows never carry the cont row tint — they get the neutral
        // `cont`-kind strip but stay on the plain card surface.
        !isIncumbent && isCont && "bg-sand-100/50"
      )}
    >
      {/* Coverage strip — incumbents always use the neutral `cont` kind
          (transparent); fintech rows reflect their pivot status. */}
      <CoverageStrip
        kind={isIncumbent ? "cont" : row.status}
        className="row-span-3 self-stretch lg:row-span-1"
      />


      {/* Company · thesis */}
      <div className="flex min-w-0 items-start gap-3 lg:items-center">
        <MonogramAvatar size="lg" name={row.name} />
        <div className="min-w-0">
          <h3 className="m-0 mb-[3px] text-[14.5px] font-semibold leading-[1.2] tracking-[-0.005em] text-foreground lg:truncate">
            <span>{row.name}</span>
            {isIncumbent && (
              <TierBadge tier="incumbent" size="sm" className="ml-2 align-middle" />
            )}
            <span className="ml-2 inline-block translate-y-[2px] font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
              {row.hq}
            </span>
          </h3>
          <p
            className={cn(
              "m-0 line-clamp-2 text-[12.5px] leading-[1.45]",
              // Incumbent thesis stays normal weight — demote by structure,
              // not by dimming type (spec §0.1 / §Surface 4).
              !isIncumbent && isCont ? "text-sand-700" : "text-sand-800"
            )}
          >
            {row.thesis ? (
              renderThesis(row.thesis)
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </p>
        </div>
      </div>

      {/* 30d activity — incumbents suppress the sparkline + delta and render
          a static `Reference` marker. Volume momentum is the exact noise we
          refuse to surface for banks (spec §Surface 4). */}
      {isIncumbent ? (
        <div className="flex items-center">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
            Reference
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Sparkline data={row.spark} kind={row.status} />
          <div>
            <div className="leading-none">
              <span className="text-[16px] font-bold tabular-nums tracking-[-0.01em] text-foreground">
                {row.jobs}
              </span>
              <span className="ml-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                jobs
              </span>
            </div>
            <div
              className={cn(
                "mt-1 font-mono text-[10.5px] font-medium leading-none",
                DELTA_COLOR(row.delta)
              )}
            >
              {formatDelta(row.delta)}{" "}
              <span className="text-muted-foreground">30d</span>
            </div>
          </div>
        </div>
      )}

      {/* Active signals · last change — incumbents suppress PivotChips
          (pivot vocabulary is fintech-only) and render one muted line. */}
      {isIncumbent ? (
        <div className="flex items-center">
          <span className="text-[11.5px] leading-[1.4] text-muted-foreground">
            Senior signal tracked · not scored for pivots
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1">
            {row.signals.length === 0 ? (
              <PivotChip kind="cont" label="Continuity" />
            ) : (
              row.signals
                .slice(0, 3)
                .map((s, i) => (
                  <PivotChip key={`${s.kind}-${i}`} kind={s.kind} label={s.label} />
                ))
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[11px] leading-[1.4]">
            <span className="shrink-0 font-mono text-[9.5px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
              Last
            </span>
            {row.lastChange ? (
              <>
                <span className="font-medium text-sand-800">
                  {row.lastChange.text}
                </span>
                <span className="font-mono text-[10.5px] text-muted-foreground">
                  · {row.lastChange.when}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
      )}
    </Link>
  );
}
