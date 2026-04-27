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
  const isCont = row.status === "cont";
  return (
    <Link
      href={`/companies/${row.slug}`}
      className={cn(
        "group grid cursor-pointer items-center gap-[18px] border-b border-border/60 py-3.5 pr-[22px] transition-colors last:border-b-0 hover:bg-sand-100",
        isCont && "bg-sand-100/50"
      )}
      style={{ gridTemplateColumns: "4px 320px 1fr 220px 240px" }}
    >
      <CoverageStrip kind={row.status} />

      {/* Company · thesis */}
      <div className="flex min-w-0 items-center gap-3">
        <MonogramAvatar size="lg" name={row.name} />
        <div className="min-w-0">
          <h3 className="m-0 mb-[3px] truncate text-[14.5px] font-semibold leading-[1.2] tracking-[-0.005em] text-foreground">
            <span>{row.name}</span>
            <span className="ml-2 inline-block translate-y-[2px] font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
              {row.hq}
            </span>
          </h3>
          <p
            className={cn(
              "m-0 line-clamp-2 text-[12.5px] leading-[1.45]",
              isCont ? "text-sand-700" : "text-sand-800"
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

      {/* 30d activity */}
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

      {/* Active signals · last change */}
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
        <div className="mt-0.5 flex items-baseline gap-1.5 text-[11px] leading-[1.4]">
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
    </Link>
  );
}
