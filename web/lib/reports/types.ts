/**
 * Shared search reports — types + pure helpers.
 *
 * A "search report" is a point-in-time artifact generated from a /jobs search:
 * an AI synthesis of the role types in the result set, a table of the matching
 * roles, and an optional note from the sender. It is readable at `/r/[token]`
 * WITHOUT an account — the token is the capability (see the migration header
 * and `docs/SHARED_REPORTS.md`).
 *
 * This module is imported by client components, the API routes, the email
 * template, and the public page, so it stays pure: no `server-only`, no
 * Supabase, no Node built-ins. Token minting lives in `share-token.ts`.
 */

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

/**
 * Maximum result rows captured into a report snapshot. A shared report is a
 * skimmable artifact, not a data dump — past ~100 rows the recipient wants the
 * CSV export instead. Also bounds `jobs_snapshot` JSONB at tens of KB.
 */
export const MAX_REPORT_JOBS = 100;

/**
 * Maximum rows fed to the synthesis prompt. The synthesis characterizes the
 * *shape* of the result set; a stratified sample of 40 does that as well as
 * 100 at ~40% of the input tokens.
 */
export const MAX_SYNTHESIS_JOBS = 40;

/** Per-job description budget in the synthesis prompt. */
export const MAX_SYNTHESIS_DESCRIPTION_CHARS = 1800;

/** Rows rendered inline in the email before it defers to the web report. */
export const MAX_EMAIL_TABLE_ROWS = 25;

/** Recipients allowed on a single send. */
export const MAX_REPORT_RECIPIENTS = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A snapshotted result row. Mirrors the visible columns of the Jobs table. */
export interface ReportJobRow {
  id: string;
  title: string;
  companyName: string;
  companySlug: string;
  functionGroup: string | null;
  location: string | null;
  /** ISO date (yyyy-mm-dd) the role was first seen. */
  firstSeenDate: string | null;
  ageDays: number | null;
  isActive: boolean;
}

/** One role cluster the synthesis identified in the result set. */
export interface ReportRoleGroup {
  /** 2-5 word cluster label, e.g. "Model risk & validation". */
  label: string;
  /** Roles in the set that belong to this cluster (model's own count). */
  count: number;
  /** One sentence on what these roles actually do. */
  detail: string;
}

/** The AI block at the top of the report. */
export interface ReportSynthesis {
  headline: string;
  summary: string;
  roleGroups: ReportRoleGroup[];
  /** Short phrases that recur across the postings' requirements. */
  commonRequirements: string[];
}

export type ReportSearchMode = "keyword" | "semantic";
export type ReportRecency = "any" | "7" | "30";
export type ReportTier = "fintech" | "incumbent" | "all";
export type ReportStatus = "active" | "inactive" | "all";

/** The search that produced the set — rendered as a provenance line. */
export interface ReportSearchContext {
  query: string | null;
  mode: ReportSearchMode;
  /** Company display name (not slug) — the report is read by outsiders. */
  company: string | null;
  functionGroup: string | null;
  recency: ReportRecency;
  tier: ReportTier;
  status: ReportStatus;
}

/** The full report as the public page and the email template consume it. */
export interface SharedReport {
  id: string;
  shareToken: string;
  title: string;
  commentary: string | null;
  authorLabel: string | null;
  searchContext: ReportSearchContext;
  synthesis: ReportSynthesis | null;
  jobs: ReportJobRow[];
  jobCount: number;
  totalMatchCount: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const RECENCY_LABELS: Record<ReportRecency, string | null> = {
  any: null,
  "7": "posted in the last 7 days",
  "30": "posted in the last 30 days",
};

const TIER_LABELS: Record<ReportTier, string | null> = {
  fintech: null, // the default scope — saying it adds nothing
  incumbent: "incumbent banks",
  all: "fintechs and incumbent banks",
};

const STATUS_LABELS: Record<ReportStatus, string | null> = {
  active: null, // the default scope
  inactive: "closed roles",
  all: "open and closed roles",
};

/**
 * Human-readable provenance line, e.g.
 * `Semantic search for "AI Engineer" · Engineering · posted in the last 30 days`.
 * Returns "All tracked roles" when nothing is narrowed.
 */
export function describeSearchContext(ctx: ReportSearchContext): string {
  const parts: string[] = [];
  if (ctx.query) {
    parts.push(
      ctx.mode === "semantic"
        ? `Semantic search for "${ctx.query}"`
        : `Search for "${ctx.query}"`
    );
  }
  if (ctx.company) parts.push(ctx.company);
  if (ctx.functionGroup) parts.push(ctx.functionGroup);
  const recency = RECENCY_LABELS[ctx.recency];
  if (recency) parts.push(recency);
  const tier = TIER_LABELS[ctx.tier];
  if (tier) parts.push(tier);
  const status = STATUS_LABELS[ctx.status];
  if (status) parts.push(status);
  return parts.length > 0 ? parts.join(" · ") : "All tracked roles";
}

/**
 * Default report title derived from the search. Users can override it in the
 * modal, so this only needs to be a sensible starting point.
 */
export function buildReportTitle(
  ctx: ReportSearchContext,
  jobCount: number
): string {
  const roleCount = `${jobCount} ${jobCount === 1 ? "role" : "roles"}`;
  if (ctx.query) return `${titleCase(ctx.query)} — ${roleCount}`;
  if (ctx.company) return `${ctx.company} — ${roleCount}`;
  if (ctx.functionGroup) return `${ctx.functionGroup} — ${roleCount}`;
  return `Fintech hiring — ${roleCount}`;
}

/** Title-case a free-text query without mangling ALLCAPS acronyms. */
function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) =>
      word === word.toUpperCase()
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

/** Absolute URL of the public report page. `appUrl` should have no trailing slash. */
export function buildReportUrl(shareToken: string, appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/r/${shareToken}`;
}

/**
 * Sample rows for the synthesis prompt. Round-robins across companies so a
 * single high-volume employer can't monopolize the sample and skew the
 * clusters toward its own titles.
 */
export function sampleJobsForSynthesis<T extends { companySlug: string }>(
  rows: T[],
  limit = MAX_SYNTHESIS_JOBS
): T[] {
  if (rows.length <= limit) return rows;

  const byCompany = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = byCompany.get(row.companySlug);
    if (bucket) bucket.push(row);
    else byCompany.set(row.companySlug, [row]);
  }

  const buckets = Array.from(byCompany.values());
  const out: T[] = [];
  for (let depth = 0; out.length < limit; depth++) {
    let placed = false;
    for (const bucket of buckets) {
      if (depth >= bucket.length) continue;
      out.push(bucket[depth]);
      placed = true;
      if (out.length >= limit) break;
    }
    if (!placed) break; // every bucket exhausted
  }
  return out;
}

/** RFC 5322-ish check. Deliberately permissive — Resend is the real validator. */
export function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Split a comma / semicolon / newline separated recipient string. */
export function parseRecipients(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Short date for report surfaces: "31 Jul 2026". */
export function formatReportDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
