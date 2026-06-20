"use client";

/**
 * JobsHeader — editorial chrome + URL-driven filter bar for the v2 Jobs page.
 *
 * Owns four filters (search, company, function, recency) plus the count
 * pill, and surfaces the digest context banner when any of the URL
 * deep-link params (theme / inDigest / from / to / company) are active.
 *
 * Filters are synced to URL search params so deep-links continue to work:
 *   ?q=...&company=<slug>&function=<group>&recency=any|7|30
 *
 * The actual job filtering happens in the parent page wrapper (a client
 * component) — this header just publishes filter state.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Search, Bell, Check, Download, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchHelpPopover } from "@/components/jobs/SearchHelpPopover";
import { getThemeLabel } from "@/lib/analysis/role-themes";

export type RecencyFilter = "any" | "7" | "30";
export type SearchMode = "keyword" | "semantic";

export interface JobsFilterState {
  q: string;
  fn: string; // function group or "all"
  recency: RecencyFilter;
  /** Lexical full-text vs. vector-similarity ("find roles like this"). */
  mode: SearchMode;
}

export interface JobsHeaderProps {
  /** All known company {slug, name} pairs to populate the dropdown. */
  companies: Array<{ slug: string; name: string }>;
  /** All known function groups to populate the dropdown. */
  functionGroups: string[];
  /** Total active roles (eyebrow line). */
  activeCount: number;
  /** Companies covered (used in the sub-headline). */
  companyCount: number;
  /** Posted in the last 7d (eyebrow line). */
  newCount: number;
  /** Filtered count for the right-aligned mono pill. */
  filteredCount: number;
  /** Total count for the right-aligned mono pill. */
  totalCount: number;

  /** Initial filter values (URL-seeded). */
  initial: JobsFilterState;

  /**
   * Active company scope (URL-seeded). Like the tier/status controls this
   * drives a server re-query — selecting a company pushes the `?company=`
   * param so semantic search re-ranks WITHIN that company instead of
   * client-narrowing the (relevance-capped) result window. `all` is the
   * default → drops the param.
   */
  companyFilter: string;

  /** Digest context (read-only — clearing routes back to /jobs). */
  digestContext: {
    themeId: string | null;
    inDigest: string | null;
    fromDate: string | null;
    toDate: string | null;
    companyName: string | null;
  };

  /**
   * Active company-tier scope (URL-seeded). Unlike the other filters this
   * one drives a server re-query — changing it does a router.push of the
   * `?tier=` param rather than living in client state.
   */
  tierFilter: "fintech" | "incumbent" | "all";

  /**
   * Whether to render the Fintech|Incumbent|All tier control. Off when
   * incumbent tracking is disabled — the control is hidden (the scope is forced
   * to fintech server-side). The control markup is kept for re-enable.
   */
  showTierFilter: boolean;

  /**
   * Activity scope (URL-seeded). Like the tier control this drives a server
   * re-query — changing it pushes the `?status=` param. `active` is the
   * default (the board only shows live roles) so that value drops the param.
   */
  statusFilter: "active" | "inactive" | "all";

  /** Notify parent of filter changes (debounced search inside). */
  onChange: (next: JobsFilterState) => void;

  /** Optional handler for the Export CSV button. When omitted the button hides. */
  onExportCsv?: () => void;
}

/** Debounce a value so we don't spam URL replaces on every keystroke. */
function useDebounced<T>(value: T, delayMs = 200): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return v;
}

export function JobsHeader({
  companies,
  functionGroups,
  activeCount,
  companyCount,
  newCount,
  filteredCount,
  totalCount,
  initial,
  digestContext,
  companyFilter,
  tierFilter,
  showTierFilter,
  statusFilter,
  onChange,
  onExportCsv,
}: JobsHeaderProps) {
  const router = useRouter();
  // We deliberately do NOT pull the live `useSearchParams()` value into the
  // syncUrl callback's dep array — `router.replace` below mutates the URL,
  // which makes useSearchParams return a new reference, which would re-fire
  // the URL-sync effect and call router.replace again → infinite loop. We
  // read window.location.search inside syncUrl at call time instead.
  const [savedHint, setSavedHint] = React.useState(false);

  const handleSaveView = React.useCallback(async () => {
    if (typeof window === "undefined") return;
    const href = window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
      } else {
        // Fallback for browsers without the clipboard API (rare in 2026 but
        // still possible on older mobile webviews).
        const textarea = document.createElement("textarea");
        textarea.value = href;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setSavedHint(true);
      window.setTimeout(() => setSavedHint(false), 2000);
    } catch {
      // Non-fatal — user can copy URL manually.
    }
  }, []);

  const [q, setQ] = React.useState(initial.q);
  const [fn, setFn] = React.useState(initial.fn);
  const [recency, setRecency] = React.useState<RecencyFilter>(initial.recency);
  const [mode, setMode] = React.useState<SearchMode>(initial.mode);
  // Semantic search embeds the query (a Gemini call), so we fire it on submit
  // (Enter / toggle), NOT on every keystroke. `submittedQ` holds the last
  // committed semantic query; keyword mode keeps using the debounced value.
  const [submittedQ, setSubmittedQ] = React.useState(initial.q);

  const debouncedQ = useDebounced(q, 180);
  const effectiveQ = mode === "semantic" ? submittedQ : debouncedQ;

  const submitSemantic = React.useCallback(() => setSubmittedQ(q), [q]);

  // Switching mode commits the current text so results update immediately:
  // into semantic → run it now; back to keyword → debounced value resumes.
  const onModeChange = React.useCallback(
    (next: SearchMode) => {
      setMode(next);
      if (next === "semantic") setSubmittedQ(q);
    },
    [q]
  );

  // Publish filter state up. Company is NOT here — it's server-driven (a
  // `?company=` re-query), like tier/status, so it never lives in client state.
  React.useEffect(() => {
    onChange({ q: effectiveQ, fn, recency, mode });
  }, [effectiveQ, fn, recency, mode, onChange]);

  // Sync filter state into the URL so deep-links + back/forward keep state.
  // We avoid clobbering digest deep-link params (theme, inDigest, from, to)
  // here — the explicit "Clear digest context" button handles those. Read
  // current params from window.location at call time (not via React state)
  // to keep this callback's identity stable across URL mutations.
  const syncUrl = React.useCallback(
    (next: JobsFilterState) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const setOrDel = (key: string, value: string | null | undefined) => {
        if (!value || value === "all" || value === "any") params.delete(key);
        else params.set(key, value);
      };
      setOrDel("q", next.q || null);
      setOrDel("function", next.fn);
      setOrDel("recency", next.recency);
      // `keyword` is the default → drop the param so a plain /jobs URL stays
      // canonical. Only persist `mode` when a query is actually present.
      setOrDel("mode", next.mode === "semantic" && next.q ? "semantic" : null);
      const qs = params.toString();
      const target = qs
        ? `${window.location.pathname}?${qs}`
        : window.location.pathname;
      // Skip the replace when nothing actually changed — avoids a second
      // round-trip through router state on initial mount.
      if (target === window.location.pathname + window.location.search) {
        return;
      }
      router.replace(target, { scroll: false });
    },
    [router]
  );

  // Push URL on state changes. In keyword mode q is the debounced value; in
  // semantic mode it's the submitted value (so typing doesn't fire embeds).
  React.useEffect(() => {
    syncUrl({ q: effectiveQ, fn, recency, mode });
  }, [effectiveQ, fn, recency, mode, syncUrl]);

  // The company control re-queries on the server (semantic ranks within the
  // company; keyword filters server-side), so it pushes the `?company=` param
  // directly — like the tier/status controls — rather than living in client
  // filter state. `all` is the default → drop the param so a plain /jobs URL
  // stays canonical.
  const setCompanyServer = React.useCallback(
    (next: string) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (next === "all") params.delete("company");
      else params.set("company", next);
      const qs = params.toString();
      router.push(
        qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
        { scroll: false }
      );
    },
    [router]
  );

  // The tier control re-queries on the server, so it pushes the `?tier=`
  // param directly (preserving the other live filter params) instead of
  // going through client filter state. `fintech` is the default → drop the
  // param entirely so a plain /jobs URL stays canonical.
  const setTier = React.useCallback(
    (next: "fintech" | "incumbent" | "all") => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (next === "fintech") params.delete("tier");
      else params.set("tier", next);
      const qs = params.toString();
      router.push(
        qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
        { scroll: false }
      );
    },
    [router]
  );

  // The status (activity) control also re-queries on the server, so it pushes
  // the `?status=` param directly. `active` is the default → drop the param so
  // a plain /jobs URL stays canonical and shows only live roles.
  const setStatus = React.useCallback(
    (next: "active" | "inactive" | "all") => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (next === "active") params.delete("status");
      else params.set("status", next);
      const qs = params.toString();
      router.push(
        qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
        { scroll: false }
      );
    },
    [router]
  );

  const hasDigestContext =
    Boolean(digestContext.themeId) ||
    Boolean(digestContext.inDigest) ||
    Boolean(digestContext.fromDate) ||
    Boolean(digestContext.toDate) ||
    Boolean(digestContext.companyName);

  const clearDigestContext = () => {
    // Reset everything to the bare /jobs path. Company is URL-driven, so the
    // bare path (no `?company=`) clears it; no client state to reset.
    setQ("");
    setFn("all");
    setRecency("any");
    router.push("/jobs");
  };

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Editorial header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p
            className="inline-flex items-center gap-2 font-medium uppercase text-sand-500"
            style={{
              fontSize: 11,
              letterSpacing: "0.09em",
              lineHeight: 1,
            }}
          >
            <span
              aria-hidden
              className="inline-block rounded-full bg-sunset-500"
              style={{ width: 6, height: 6 }}
            />
            <span>
              {activeCount.toLocaleString()} active roles · {newCount.toLocaleString()} posted in
              the last 7d
            </span>
          </p>
          <h1
            className="font-display text-sand-950"
            style={{
              fontSize: 32,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              fontWeight: 600,
            }}
          >
            Jobs
          </h1>
          <p className="max-w-[66ch] text-[13.5px] leading-[1.55] text-sand-700">
            Every active role across the {companyCount} companies we cover.
            Filter by company, function, and recency.
          </p>
        </div>
        <div className="flex shrink-0 gap-2.5">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handleSaveView}
            aria-live="polite"
            title="Copy this filter URL to your clipboard"
          >
            {savedHint ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden />
                Link copied
              </>
            ) : (
              <>
                <Bell className="h-3.5 w-3.5" aria-hidden />
                Save view
              </>
            )}
          </Button>
          {onExportCsv && (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={onExportCsv}
              disabled={filteredCount === 0}
              title={
                filteredCount === 0
                  ? "Nothing to export"
                  : `Download ${filteredCount.toLocaleString()} ${filteredCount === 1 ? "row" : "rows"} as CSV`
              }
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Export CSV ({filteredCount.toLocaleString()})
            </Button>
          )}
        </div>
      </div>

      {/* Digest context banner */}
      {hasDigestContext && (
        <DigestContextBanner
          digestContext={digestContext}
          filteredCount={filteredCount}
          totalCount={totalCount}
          onClear={clearDigestContext}
        />
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative w-full max-w-[320px] flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sand-400" />
          <Input
            type="search"
            placeholder={
              mode === "semantic"
                ? "Describe the role… then press Enter"
                : "Search roles, skills, descriptions…"
            }
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && mode === "semantic") submitSemantic();
            }}
            className="pl-9 pr-9"
          />
          {mode === "keyword" ? (
            <SearchHelpPopover className="absolute right-2.5 top-1/2 -translate-y-1/2" />
          ) : (
            <Sparkles className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-pacific-500" />
          )}
        </div>

        {/* Search-mode toggle. Keyword = lexical full-text (matches as you
            type). Semantic = vector similarity ("find roles like this"),
            embedded on submit. */}
        <div
          role="group"
          aria-label="Search mode"
          className="inline-flex rounded-md border border-sand-200 bg-card p-[3px]"
        >
          {([
            ["keyword", "Keyword"],
            ["semantic", "Semantic"],
          ] as const).map(([k, label]) => {
            const active = mode === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={active}
                onClick={() => onModeChange(k)}
                className={cn(
                  "rounded px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                  active
                    ? "bg-sand-50 text-sand-900 ring-1 ring-sand-200"
                    : "text-sand-500 hover:text-sand-700"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <Select value={companyFilter} onValueChange={setCompanyServer}>
          <SelectTrigger className="min-w-[160px]">
            <SelectValue placeholder="All companies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All companies</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={fn} onValueChange={setFn}>
          <SelectTrigger className="min-w-[180px]">
            <SelectValue placeholder="All functions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All functions</SelectItem>
            {functionGroups.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Recency segmented control */}
        <div
          role="group"
          aria-label="Posted within"
          className="inline-flex rounded-md border border-sand-200 bg-card p-[3px]"
        >
          {([
            ["any", "Any time"],
            ["7", "Last 7d"],
            ["30", "Last 30d"],
          ] as const).map(([k, label]) => {
            const active = recency === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={active}
                onClick={() => setRecency(k)}
                className={cn(
                  "rounded px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                  active
                    ? "bg-sand-50 text-sand-900 ring-1 ring-sand-200"
                    : "text-sand-500 hover:text-sand-700"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Tier segmented control — scopes which company tiers the list
            shows. Drives the `?tier=` URL param (server re-query). Kept
            understated: same segmented styling as the recency control.
            Hidden when incumbent tracking is off (scope forced to fintech). */}
        {showTierFilter && (
          <div
            role="group"
            aria-label="Company tier"
            className="inline-flex rounded-md border border-sand-200 bg-card p-[3px]"
          >
            {([
              ["fintech", "Fintech"],
              ["incumbent", "Incumbent"],
              ["all", "All"],
            ] as const).map(([k, label]) => {
              const active = tierFilter === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTier(k)}
                  className={cn(
                    "rounded px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                    active
                      ? "bg-sand-50 text-sand-900 ring-1 ring-sand-200"
                      : "text-sand-500 hover:text-sand-700"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Status (activity) segmented control — scopes the board to live,
            closed, or all roles. Drives the `?status=` URL param (server
            re-query). Default `Active` keeps closed postings out of the way. */}
        <div
          role="group"
          aria-label="Posting status"
          className="inline-flex rounded-md border border-sand-200 bg-card p-[3px]"
        >
          {([
            ["active", "Active"],
            ["inactive", "Inactive"],
            ["all", "All"],
          ] as const).map(([k, label]) => {
            const active = statusFilter === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={active}
                onClick={() => setStatus(k)}
                className={cn(
                  "rounded px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                  active
                    ? "bg-sand-50 text-sand-900 ring-1 ring-sand-200"
                    : "text-sand-500 hover:text-sand-700"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <span className="ml-auto font-mono text-[12px] tabular-nums text-sand-500">
          {filteredCount.toLocaleString()}{" "}
          {filteredCount === 1 ? "match" : "matches"}
        </span>
      </div>
    </div>
  );
}

interface DigestContextBannerProps {
  digestContext: JobsHeaderProps["digestContext"];
  filteredCount: number;
  totalCount: number;
  onClear: () => void;
}

/**
 * Orientation cue when the user lands from a weekly digest deep link.
 * Mirrors the original JobHistoryView banner so the experience stays
 * identical when arriving from email.
 */
function DigestContextBanner({
  digestContext,
  filteredCount,
  totalCount,
  onClear,
}: DigestContextBannerProps) {
  const fragments: React.ReactNode[] = [];

  if (digestContext.companyName) {
    fragments.push(
      <React.Fragment key="company">
        <span className="font-semibold text-sand-950">
          {digestContext.companyName}
        </span>
        &rsquo;s jobs
      </React.Fragment>
    );
  } else {
    fragments.push(<React.Fragment key="all">jobs</React.Fragment>);
  }

  if (digestContext.themeId) {
    fragments.push(
      <React.Fragment key="theme">
        {" "}in{" "}
        <span className="font-semibold text-sand-950">
          {getThemeLabel(digestContext.themeId)}
        </span>
      </React.Fragment>
    );
  }

  if (digestContext.inDigest) {
    fragments.push(<React.Fragment key="in-digest">, from this digest</React.Fragment>);
  } else if (digestContext.fromDate || digestContext.toDate) {
    const fromLabel = digestContext.fromDate
      ? format(new Date(digestContext.fromDate), "MMM d")
      : null;
    const toLabel = digestContext.toDate
      ? format(new Date(digestContext.toDate), "MMM d, yyyy")
      : null;
    if (fromLabel && toLabel) {
      fragments.push(
        <React.Fragment key="range">
          , between {fromLabel} and {toLabel}
        </React.Fragment>
      );
    } else if (fromLabel) {
      fragments.push(
        <React.Fragment key="from">, from {fromLabel} onward</React.Fragment>
      );
    } else if (toLabel) {
      fragments.push(
        <React.Fragment key="to">, through {toLabel}</React.Fragment>
      );
    }
  }

  return (
    <div className="rounded-lg border border-sand-200 bg-sand-50 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="text-[13px] text-sand-700">
          <div>Viewing {fragments}</div>
          <div className="mt-1 text-[12px] text-sand-500">
            {filteredCount.toLocaleString()} of {totalCount.toLocaleString()}{" "}
            {totalCount === 1 ? "job" : "jobs"} match
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="shrink-0"
        >
          Clear filters
        </Button>
      </div>
    </div>
  );
}
