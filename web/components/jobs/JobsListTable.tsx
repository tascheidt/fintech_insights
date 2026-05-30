"use client";

/**
 * JobsListTable — sortable left column of the v2 Jobs page.
 *
 * Visual contract from /tmp/design-package-v2/.../JobsList_v2.jsx:
 *   [Title (sigs + new pill) | Company (mono + name) | Function (dot + group)
 *    | Location (city + Hybrid/Remote tag) | Posted (mono right) | chevron]
 * The row is the link target — navigates to /jobs/[id].
 *
 * Sorting and the remaining filters (company / function / recency / theme)
 * are local state. The free-text search is server-side: `getJobsListData`
 * pushes the `?q=` term into Postgres full-text search over the `search_tsv`
 * column (title + location + description body). Row data here is already the
 * filtered set; this component does not re-search.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronUp, ChevronDown, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MonogramAvatar,
  FunctionDot,
  SignalTag,
} from "@/components/design";
import { TierBadge } from "@/components/ui/TierBadge";
import type { JobsListRow } from "@/lib/dashboard-queries";
import { useJobSelection } from "@/components/jobs/JobSelectionContext";

type SortKey = "title" | "company" | "function" | "location" | "posted";
type SortDir = "asc" | "desc";

export interface JobsListTableProps {
  rows: JobsListRow[];
}

/** Bucketed remote-ness derived from structured location or string heuristic. */
function deriveRemote(row: JobsListRow): "Remote" | "Hybrid" | "On-site" | null {
  const formatted =
    row.locationStructured?.formatted ?? row.location ?? "";
  const lc = formatted.toLowerCase();
  if (!lc.trim()) return null;
  if (/\bremote\b/.test(lc)) return "Remote";
  if (/\bhybrid\b/.test(lc)) return "Hybrid";
  if (/\bon[-\s]?site\b/.test(lc) || /\bin[-\s]?office\b/.test(lc))
    return "On-site";
  return null;
}

/** Short city/region label, stripping the remote suffix if present. */
function shortLocation(row: JobsListRow): string {
  const structured = row.locationStructured;
  if (structured?.city || structured?.country) {
    const parts = [structured.city, structured.country].filter(
      (v): v is string => Boolean(v)
    );
    if (parts.length > 0) return parts.join(", ");
  }
  const raw = row.location ?? "";
  if (!raw.trim()) return "—";
  // Drop common remote-status suffixes.
  const cleaned = raw
    .replace(/[·•|]\s*(remote|hybrid|on[-\s]?site)\b/gi, "")
    .trim();
  const segments = cleaned
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (segments.length <= 2) return segments.join(", ");
  const country = segments[segments.length - 1];
  const city = segments.find((p) => !/\d/.test(p)) ?? segments[0];
  return city === country ? city : `${city}, ${country}`;
}

/** "today" / "Nd" / "Nw" age formatter for the right-aligned mono cell. */
function formatAge(ageDays: number | null): string {
  if (ageDays === null) return "—";
  if (ageDays < 1) return "today";
  if (ageDays < 7) return `${ageDays}d`;
  if (ageDays < 56) return `${Math.floor(ageDays / 7)}w`;
  return `${Math.floor(ageDays / 30)}mo`;
}

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  current: { key: SortKey; dir: SortDir };
  onClick: (key: SortKey) => void;
  align?: "left" | "right";
}

function SortHeader({ label, sortKey, current, onClick, align = "left" }: SortHeaderProps) {
  const active = current.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={cn(
        "inline-flex w-full items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors",
        active ? "text-sand-900" : "text-sand-500 hover:text-sand-700",
        align === "right" ? "justify-end" : "justify-start"
      )}
    >
      <span>{label}</span>
      {active &&
        (current.dir === "asc" ? (
          <ChevronUp className="h-2.5 w-2.5" aria-hidden />
        ) : (
          <ChevronDown className="h-2.5 w-2.5" aria-hidden />
        ))}
    </button>
  );
}

// Responsive column template:
//   <lg (≤1023px):  Title (flex) | Posted | chevron — Company/Function/Location
//                    collapse into a metadata row below the title. Even at
//                    768/1024 the title needs ~250px+ to read, which breaks
//                    once we re-introduce the four side columns.
//   lg+:            Title (flex) | Company | Function | Location | Posted | chevron
//                    — slim fixed widths so the title column keeps room.
//   xl+:            Same as lg but with the rail siphoning 298px from the
//                    page width; no further changes inside the table needed.
//
// Keep these classes synced with `HIDE_BELOW_LG` below.
const GRID_COLS =
  "grid grid-cols-[28px_minmax(0,1fr)_56px_24px] items-center gap-3 px-3 " +
  "lg:grid-cols-[28px_minmax(0,1fr)_minmax(0,160px)_minmax(0,140px)_minmax(0,140px)_64px_20px] lg:gap-3.5 lg:px-[18px]";

const HIDE_BELOW_LG = "hidden lg:flex";
const HIDE_BELOW_LG_INLINE = "hidden lg:inline-flex";

export function JobsListTable({ rows }: JobsListTableProps) {
  const router = useRouter();
  const { toggle, isSelected } = useJobSelection();
  const [sort, setSort] = React.useState<{ key: SortKey; dir: SortDir }>({
    key: "posted",
    dir: "asc",
  });

  const onSortClick = React.useCallback((key: SortKey) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }, []);

  const sorted = React.useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let v = 0;
      switch (sort.key) {
        case "title":
          v = a.title.localeCompare(b.title);
          break;
        case "company":
          v = a.companyName.localeCompare(b.companyName);
          break;
        case "function":
          v = (a.functionGroup ?? "").localeCompare(b.functionGroup ?? "");
          break;
        case "location":
          v = (a.location ?? "").localeCompare(b.location ?? "");
          break;
        case "posted":
          v =
            (a.ageDays ?? Number.POSITIVE_INFINITY) -
            (b.ageDays ?? Number.POSITIVE_INFINITY);
          break;
      }
      return sort.dir === "asc" ? v : -v;
    });
    return arr;
  }, [rows, sort]);

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-sand-200 bg-card overflow-hidden">
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
          <SearchX className="h-6 w-6 text-sand-400" aria-hidden />
          <p className="text-[13px] font-medium text-sand-900">
            No jobs match these filters.
          </p>
          <p className="text-[12.5px] text-sand-500">
            Try clearing recency or function.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sand-200 bg-card overflow-hidden">
      {/* Header row */}
      <div
        className={cn(
          GRID_COLS,
          "border-b border-sand-200 bg-sand-100 py-[11px]"
        )}
      >
        <span aria-hidden />
        <SortHeader label="Title" sortKey="title" current={sort} onClick={onSortClick} />
        <div className={HIDE_BELOW_LG_INLINE}>
          <SortHeader label="Company" sortKey="company" current={sort} onClick={onSortClick} />
        </div>
        <div className={HIDE_BELOW_LG_INLINE}>
          <SortHeader label="Function" sortKey="function" current={sort} onClick={onSortClick} />
        </div>
        <div className={HIDE_BELOW_LG_INLINE}>
          <SortHeader label="Location" sortKey="location" current={sort} onClick={onSortClick} />
        </div>
        <SortHeader label="Posted" sortKey="posted" current={sort} onClick={onSortClick} align="right" />
        <span aria-hidden />
      </div>

      {/* Body rows */}
      {sorted.map((row, idx) => {
        const isNew = row.ageDays !== null && row.ageDays <= 7;
        const remote = deriveRemote(row);
        const sigs = row.keywords.slice(0, 3);
        const checked = isSelected(row.id);
        return (
          <div
            key={row.id}
            role="link"
            tabIndex={0}
            onClick={() => router.push(`/jobs/${row.id}?source=jobs`)}
            onKeyDown={(e) => {
              if (e.key === "Enter") router.push(`/jobs/${row.id}?source=jobs`);
            }}
            className={cn(
              GRID_COLS,
              "cursor-pointer py-[11px] transition-colors hover:bg-sand-100",
              checked && "bg-pacific-50",
              idx !== sorted.length - 1 && "border-b border-sand-100"
            )}
          >
            {/* Selection checkbox */}
            <div
              className="flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                toggle(row.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  toggle(row.id);
                }
              }}
            >
              <div
                role="checkbox"
                aria-checked={checked}
                tabIndex={0}
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  checked
                    ? "border-pacific-500 bg-pacific-500 text-white"
                    : "border-sand-300 bg-white hover:border-sand-400"
                )}
              >
                {checked && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
                    <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>

            {/* Title cell — title is single-line truncated so the row
                height stays predictable. NEW pill sits inline. Signal
                tags + the mobile metadata strip live in their own rows
                below, only wrapping if they really need to. */}
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="min-w-0 flex-1 truncate text-[13.5px] font-medium leading-tight tracking-[-0.005em] text-sand-950"
                  title={row.title}
                >
                  {row.title}
                </span>
                {isNew && (
                  <span
                    className="inline-flex shrink-0 items-center rounded-[4px] bg-sunset-100 font-display uppercase text-sunset-800"
                    style={{
                      fontSize: 10,
                      padding: "3px 6px",
                      lineHeight: 1,
                      letterSpacing: "0.04em",
                    }}
                  >
                    new
                  </span>
                )}
              </div>

              {/* Mobile metadata strip — only renders below md, and gives
                  the reader the four pieces of info they'd otherwise see
                  in dedicated columns. Renders as a single wrapping row. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-sand-500 lg:hidden">
                <span className="inline-flex items-center gap-1">
                  <MonogramAvatar size="sm" name={row.companyName} />
                  <span className="font-medium text-sand-700">{row.companyName}</span>
                  <TierBadge tier={row.companyTier} size="sm" />
                </span>
                {row.functionGroup && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1">
                      <FunctionDot fn={row.functionGroup} />
                      <span className="text-sand-700">{row.functionGroup}</span>
                    </span>
                  </>
                )}
                {shortLocation(row) !== "—" && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="text-sand-700">{shortLocation(row)}</span>
                  </>
                )}
                {remote && (
                  <span
                    className="font-mono uppercase text-sand-400"
                    style={{
                      fontSize: 9.5,
                      letterSpacing: "0.04em",
                      lineHeight: 1,
                    }}
                  >
                    {remote}
                  </span>
                )}
              </div>

              {/* Signal tags — second line, wraps cleanly without forcing
                  the title to wrap. Hidden below sm to keep mobile rows
                  compact. */}
              {sigs.length > 0 && (
                <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
                  {sigs.map((s, i) => (
                    <SignalTag key={i}>{s}</SignalTag>
                  ))}
                </div>
              )}
            </div>

            {/* Company cell */}
            <div className={cn(HIDE_BELOW_LG, "min-w-0 items-center gap-2")}>
              <MonogramAvatar size="sm" name={row.companyName} />
              <span
                className="truncate text-[12.5px] font-medium text-sand-700"
                title={row.companyName}
              >
                {row.companyName}
              </span>
              <TierBadge tier={row.companyTier} size="sm" />
            </div>

            {/* Function cell */}
            <div
              className={cn(
                HIDE_BELOW_LG_INLINE,
                "min-w-0 items-center gap-1.5 text-[12px] font-medium text-sand-700"
              )}
            >
              {row.functionGroup ? (
                <>
                  <FunctionDot fn={row.functionGroup} />
                  <span className="truncate">{row.functionGroup}</span>
                </>
              ) : (
                <span className="text-sand-400">—</span>
              )}
            </div>

            {/* Location cell */}
            <div
              className={cn(
                HIDE_BELOW_LG,
                "min-w-0 items-center gap-1.5 text-[12px] text-sand-700"
              )}
            >
              <span className="truncate" title={row.location ?? undefined}>
                {shortLocation(row)}
              </span>
              {remote && (
                <span
                  className="font-mono uppercase text-sand-400 shrink-0"
                  style={{
                    fontSize: 9.5,
                    letterSpacing: "0.04em",
                    lineHeight: 1,
                  }}
                >
                  {remote}
                </span>
              )}
            </div>

            {/* Age cell */}
            <span className="text-right font-mono text-[11.5px] tabular-nums text-sand-500">
              {formatAge(row.ageDays)}
            </span>

            {/* Chevron */}
            <ChevronRight
              className="h-3.5 w-3.5 text-sand-400"
              aria-hidden
            />
          </div>
        );
      })}
    </div>
  );
}
