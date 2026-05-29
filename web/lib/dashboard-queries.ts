import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  getCategoryGroup,
  RoleCategory,
  CATEGORY_GROUPS,
  ROLE_CATEGORIES,
} from "@/lib/analysis/function-categories";
import { isIncumbentSignalJob } from "@/lib/analysis/incumbent-signal";
import { startOfWeek, format, subDays, parseISO, addHours } from "date-fns";
import { log } from "@/lib/log";

/**
 * Many of the company-scoped helpers below accept an optional Supabase
 * client so they can be invoked from request scope (default: the
 * cookie-bound `createClient`) or from a script / cron (admin client).
 *
 * We accept `SupabaseClient` directly — the helpers don't need a typed
 * Database generic to function.
 */
type SupabaseLike = SupabaseClient;

const ROLLING_WEEK_DAYS = 7;

/**
 * Company tier classification.
 *
 * `fintech` is the platform's primary subject. `incumbent` covers big-bank /
 * non-fintech companies whose hiring is useful as benchmark signal but would
 * dominate volume aggregates if surfaced alongside fintechs. Every cross-
 * company aggregator in this file accepts a `tiers` parameter that defaults
 * to `DEFAULT_TIERS` (fintech-only). Surfaces that want bank signal — like
 * the planned Incumbent Bets rail — opt in explicitly with `['incumbent']`
 * or `['fintech','incumbent']`.
 *
 * Self-scoped helpers (company drill-down, sparkline, hiring delta) do not
 * take a `tiers` argument: they're invoked with an explicit company id and
 * the caller already knows the tier.
 */
export type CompanyTier = "fintech" | "incumbent";
export const DEFAULT_TIERS: readonly CompanyTier[] = ["fintech"];

function getRollingWeekStartIso(now: Date = new Date()): string {
  return subDays(now, ROLLING_WEEK_DAYS).toISOString();
}

// ============================================================================
// Types
// ============================================================================

export interface WeeklyTrend {
  date: string;
  label: string;
  count: number;
}

export interface RawFunctionData {
  company_id: string;
  function_category: string;
  first_seen_date: string;
}

export interface FunctionTrend {
  period: string;
  date: string;
  [key: string]: string | number;
}

export interface NetHiringFlowPoint {
  date: string;
  label: string;
  newJobs: number;
  closedJobs: number;
  net: number;
}

export interface CompetitiveMatrixRow {
  companyId: string;
  companyName: string;
  companySlug: string;
  groups: Record<string, { current: number; change: number }>;
  total: number;
  weekChange: number;
}

export interface HotRole {
  id: string;
  title: string;
  companyName: string;
  companySlug: string;
  firstSeenDate: string;
  functionCategory: string | null;
}

export interface LatestDigest {
  id: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  globalSummary: {
    headline?: string;
    key_insight?: string;
    body?: string;
  } | null;
  industryTrends: Array<{
    trend: string;
    explanation: string;
    companies: string[];
    jobCount: number;
    direction: string;
  }>;
  strategySignals: Array<{
    company: string;
    alignment: string;
    signal: string;
    detail: string;
    interpretation?: string;
  }>;
}

export interface DailyJobCount {
  date: string;
  count: number;
}

export interface DonutDataPoint {
  name: string;
  value: number;
  color: string;
  [key: string]: string | number;
}

// ============================================================================
// Backfill Filtering
// ============================================================================

/**
 * Get per-company backfill cutoff dates.
 * Jobs posted within 48h of a company's created_at are considered backfill.
 */
export async function getCompanyBackfillCutoffs(): Promise<Map<string, Date>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("id, created_at")
    .eq("is_active", true);

  const cutoffs = new Map<string, Date>();
  for (const company of data ?? []) {
    if (company.created_at) {
      cutoffs.set(company.id, addHours(new Date(company.created_at), 48));
    }
  }
  return cutoffs;
}

function isBackfill(
  companyId: string,
  firstSeenDate: string | null,
  cutoffs: Map<string, Date>
): boolean {
  if (!firstSeenDate) return false;
  const cutoff = cutoffs.get(companyId);
  if (!cutoff) return false;
  return new Date(firstSeenDate) < cutoff;
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get job posting volume trends grouped by week, excluding backfill.
 *
 * Filters to `tiers` (default fintech-only) via an inner join on companies so
 * incumbent (big-bank) postings do not skew the headline trend.
 */
export async function getPostingTrends(
  days: number,
  cutoffs: Map<string, Date>,
  tiers: readonly CompanyTier[] = DEFAULT_TIERS
): Promise<WeeklyTrend[]> {
  const supabase = await createClient();
  const startDate = subDays(new Date(), days).toISOString();

  const { data: jobs, error } = await supabase
    .from("job_postings")
    .select("company_id, first_seen_date, companies!inner(tier)")
    .in("companies.tier", [...tiers])
    .gte("first_seen_date", startDate)
    .order("first_seen_date", { ascending: true });

  if (error || !jobs) return [];

  const weeklyMap = new Map<string, number>();

  for (const job of jobs) {
    if (!job.first_seen_date) continue;
    if (isBackfill(job.company_id, job.first_seen_date, cutoffs)) continue;

    const date = parseISO(job.first_seen_date);
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const key = weekStart.toISOString();
    weeklyMap.set(key, (weeklyMap.get(key) || 0) + 1);
  }

  return Array.from(weeklyMap.entries())
    .map(([date, count]) => ({
      date,
      label: format(parseISO(date), "MMM d"),
      count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get raw function category data for client-side filtering, excluding backfill.
 *
 * Filters to `tiers` (default fintech-only) so the dashboard function-mix
 * view stays fintech-focused.
 */
export async function getRawFunctionData(
  days: number,
  cutoffs: Map<string, Date>,
  tiers: readonly CompanyTier[] = DEFAULT_TIERS
): Promise<RawFunctionData[]> {
  const supabase = await createClient();
  const startDate = subDays(new Date(), days).toISOString();

  const { data: jobs, error } = await supabase
    .from("job_postings")
    .select("company_id, function_category, first_seen_date, companies!inner(tier)")
    .in("companies.tier", [...tiers])
    .gte("first_seen_date", startDate)
    .not("function_category", "is", null)
    .not("first_seen_date", "is", null);

  if (error || !jobs) return [];

  return (jobs as RawFunctionData[]).filter(
    (job) => !isBackfill(job.company_id, job.first_seen_date, cutoffs)
  );
}

/**
 * Get net hiring flow data: new vs closed jobs per week.
 *
 * Filters to `tiers` (default fintech-only) on both the new- and closed-job
 * pulls so flow numbers remain peer-comparable.
 */
export async function getNetHiringFlow(
  days: number,
  cutoffs: Map<string, Date>,
  tiers: readonly CompanyTier[] = DEFAULT_TIERS
): Promise<NetHiringFlowPoint[]> {
  const supabase = await createClient();
  const startDate = subDays(new Date(), days).toISOString();
  const tierList = [...tiers];

  const [{ data: newJobs }, { data: closedJobs }] = await Promise.all([
    supabase
      .from("job_postings")
      .select("company_id, first_seen_date, companies!inner(tier)")
      .in("companies.tier", tierList)
      .gte("first_seen_date", startDate)
      .not("first_seen_date", "is", null),
    supabase
      .from("job_postings")
      .select("company_id, first_seen_date, closed_date, companies!inner(tier)")
      .in("companies.tier", tierList)
      .gte("closed_date", startDate)
      .not("closed_date", "is", null),
  ]);

  const weeklyNew = new Map<string, number>();
  const weeklyClosed = new Map<string, number>();

  for (const job of newJobs ?? []) {
    if (!job.first_seen_date) continue;
    if (isBackfill(job.company_id, job.first_seen_date, cutoffs)) continue;

    const weekStart = startOfWeek(parseISO(job.first_seen_date), {
      weekStartsOn: 1,
    });
    const key = weekStart.toISOString();
    weeklyNew.set(key, (weeklyNew.get(key) || 0) + 1);
  }

  for (const job of closedJobs ?? []) {
    if (!job.closed_date) continue;
    if (isBackfill(job.company_id, job.first_seen_date, cutoffs)) continue;

    const weekStart = startOfWeek(parseISO(job.closed_date), {
      weekStartsOn: 1,
    });
    const key = weekStart.toISOString();
    weeklyClosed.set(key, (weeklyClosed.get(key) || 0) + 1);
  }

  const allWeeks = new Set([...weeklyNew.keys(), ...weeklyClosed.keys()]);

  return Array.from(allWeeks)
    .map((date) => {
      const n = weeklyNew.get(date) || 0;
      const c = weeklyClosed.get(date) || 0;
      return {
        date,
        label: format(parseISO(date), "MMM d"),
        newJobs: n,
        closedJobs: c,
        net: n - c,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get competitive matrix data: jobs per company per function group.
 * Always includes ALL active tracked companies (even those with zero jobs).
 * Supports historical windows that include closed jobs overlapping the period.
 */
export async function getCompetitiveMatrixData(
  cutoffs: Map<string, Date>,
  options?: {
    windowDays?: number | null; // null = current active snapshot
    includeClosed?: boolean;
    tiers?: readonly CompanyTier[];
  }
): Promise<CompetitiveMatrixRow[]> {
  const supabase = await createClient();
  const isHistorical = options?.windowDays != null;
  const includeClosed = isHistorical && (options?.includeClosed ?? false);
  const rollingWeekStart = getRollingWeekStartIso();
  const tierList = [...(options?.tiers ?? DEFAULT_TIERS)];

  // Always seed from active companies in the selected tier(s) so the matrix
  // shows every fintech (or every incumbent in a tier-incumbent view), not
  // just those with jobs in the window.
  const { data: allCompanies } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("is_active", true)
    .in("tier", tierList);

  // Build jobs query based on mode. Inner-join companies and filter on tier
  // so a future incumbent row cannot leak into the fintech matrix.
  let jobsQuery = supabase
    .from("job_postings")
    .select(
      "company_id, function_category, first_seen_date, is_active, companies!inner(id, name, slug, is_active, tier)"
    )
    .eq("companies.is_active", true)
    .in("companies.tier", tierList);

  if (includeClosed) {
    // Jobs that overlapped the window: active OR closed within the window
    const startDate = subDays(new Date(), options!.windowDays!).toISOString();
    jobsQuery = jobsQuery.or(
      `is_active.eq.true,closed_date.gte.${startDate}`
    );
  } else {
    // Only currently active jobs
    jobsQuery = jobsQuery.eq("is_active", true);
  }

  const { data: jobs } = await jobsQuery;

  // Seed the map with all active companies so none are missing
  const companyMap = new Map<
    string,
    {
      name: string;
      slug: string;
      uncategorized: number;
      groups: Record<string, { current: number; newThisWeek: number }>;
    }
  >();

  for (const c of allCompanies ?? []) {
    companyMap.set(c.id, {
      name: c.name,
      slug: c.slug,
      uncategorized: 0,
      groups: {},
    });
  }

  // Group jobs by company and function group
  for (const job of jobs ?? []) {
    const company = Array.isArray(job.companies)
      ? job.companies[0]
      : job.companies;
    if (!company) continue;

    // Ensure company entry exists (in case allCompanies missed it)
    if (!companyMap.has(job.company_id)) {
      companyMap.set(job.company_id, {
        name: (company as { name: string }).name,
        slug: (company as { slug: string }).slug,
        uncategorized: 0,
        groups: {},
      });
    }

    const entry = companyMap.get(job.company_id)!;

    if (!job.function_category) {
      entry.uncategorized++;
      continue;
    }

    const group = getCategoryGroup(job.function_category as RoleCategory);

    if (!entry.groups[group]) {
      entry.groups[group] = { current: 0, newThisWeek: 0 };
    }
    entry.groups[group].current++;

    // Only track weekly new for current (non-historical) mode
    if (
      !isHistorical &&
      job.first_seen_date &&
      job.first_seen_date >= rollingWeekStart &&
      !isBackfill(job.company_id, job.first_seen_date, cutoffs)
    ) {
      entry.groups[group].newThisWeek++;
    }
  }

  // Only compute 7d closed delta for current (non-historical) mode
  const closedByCompanyGroup = new Map<string, Record<string, number>>();
  const closedUncategorized = new Map<string, number>();

  if (!isHistorical) {
    const { data: closedThisWeek } = await supabase
      .from("job_postings")
      .select("company_id, function_category, companies!inner(tier)")
      .in("companies.tier", tierList)
      .gte("closed_date", rollingWeekStart);

    for (const job of closedThisWeek ?? []) {
      if (!job.function_category) {
        closedUncategorized.set(
          job.company_id,
          (closedUncategorized.get(job.company_id) || 0) + 1
        );
        continue;
      }
      const group = getCategoryGroup(job.function_category as RoleCategory);
      if (!closedByCompanyGroup.has(job.company_id)) {
        closedByCompanyGroup.set(job.company_id, {});
      }
      const groups = closedByCompanyGroup.get(job.company_id)!;
      groups[group] = (groups[group] || 0) + 1;
    }
  }

  const functionGroups = Object.keys(CATEGORY_GROUPS).filter(
    (g) => g !== "Other"
  );

  return Array.from(companyMap.entries())
    .map(([companyId, data]) => {
      const groups: Record<string, { current: number; change: number }> = {};
      let total = data.uncategorized;
      let weekChange = isHistorical
        ? 0
        : -(closedUncategorized.get(companyId) || 0);

      for (const group of functionGroups) {
        const current = data.groups[group]?.current || 0;
        const newThisWeek = data.groups[group]?.newThisWeek || 0;
        const closedThisWeekCount = isHistorical
          ? 0
          : (closedByCompanyGroup.get(companyId)?.[group] || 0);
        const change = isHistorical ? 0 : newThisWeek - closedThisWeekCount;

        groups[group] = { current, change };
        total += current;
        weekChange += change;
      }

      if (data.groups["Other"]) {
        const otherNew = data.groups["Other"].newThisWeek || 0;
        const otherClosed = isHistorical
          ? 0
          : (closedByCompanyGroup.get(companyId)?.["Other"] || 0);
        groups["Other"] = {
          current: data.groups["Other"].current,
          change: isHistorical ? 0 : otherNew - otherClosed,
        };
        total += data.groups["Other"].current;
        weekChange += groups["Other"].change;
      }

      return {
        companyId,
        companyName: data.name,
        companySlug: data.slug,
        groups,
        total,
        weekChange,
      };
    })
    // Always include all active companies, even with zero jobs
    .sort((a, b) => b.total - a.total);
}

/**
 * Get the latest weekly digest with global_summary, industry_trends, strategy_signals.
 */
export async function getLatestDigest(): Promise<LatestDigest | null> {
  const supabase = await createClient();

  const { data: digest } = await supabase
    .from("weekly_digests")
    .select(
      "id, global_summary, industry_trends, strategy_signals, week_start, week_end, generated_at"
    )
    .order("week_start", { ascending: false })
    .limit(1)
    .single();

  if (!digest) return null;

  return {
    id: digest.id,
    weekStart: digest.week_start,
    weekEnd: digest.week_end,
    generatedAt: digest.generated_at,
    globalSummary: digest.global_summary as LatestDigest["globalSummary"],
    industryTrends:
      (digest.industry_trends as LatestDigest["industryTrends"]) || [],
    strategySignals:
      (digest.strategy_signals as LatestDigest["strategySignals"]) || [],
  };
}

/**
 * Get most recent active job postings for the hot roles feed, excluding backfill.
 *
 * Filters to `tiers` (default fintech-only). Phase 2 will add an "Incumbent
 * Bets" rail that queries with `tiers: ['incumbent']` and an additional
 * seniority/function gate.
 */
export async function getHotRoles(
  cutoffs: Map<string, Date>,
  limit: number = 15,
  tiers: readonly CompanyTier[] = DEFAULT_TIERS
): Promise<HotRole[]> {
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from("job_postings")
    .select(
      "id, title, company_id, first_seen_date, function_category, companies!inner(name, slug, is_active, tier)"
    )
    .eq("is_active", true)
    .eq("companies.is_active", true)
    .in("companies.tier", [...tiers])
    .order("first_seen_date", { ascending: false })
    .limit(50); // Fetch extra to account for backfill filtering

  if (!jobs) return [];

  return jobs
    .filter(
      (job) => !isBackfill(job.company_id, job.first_seen_date, cutoffs)
    )
    .slice(0, limit)
    .map((job) => {
      const company = Array.isArray(job.companies)
        ? job.companies[0]
        : job.companies;
      return {
        id: job.id,
        title: job.title,
        companyName: (company as { name: string })?.name ?? "Unknown",
        companySlug: (company as { slug: string })?.slug ?? "",
        firstSeenDate: job.first_seen_date,
        functionCategory: job.function_category,
      };
    });
}

/**
 * Get net new/closed jobs in the last 7 days, excluding backfill from new count.
 *
 * Filters to `tiers` (default fintech-only) on both pulls so the headline
 * KPI cards stay peer-comparable.
 */
export async function getNetThisWeek(
  cutoffs: Map<string, Date>,
  tiers: readonly CompanyTier[] = DEFAULT_TIERS
): Promise<{ newCount: number; closedCount: number }> {
  const supabase = await createClient();
  const rollingWeekStart = getRollingWeekStartIso();
  const tierList = [...tiers];

  const [{ data: newJobs }, { count: closedCount }] = await Promise.all([
    supabase
      .from("job_postings")
      .select("company_id, first_seen_date, companies!inner(tier)")
      .in("companies.tier", tierList)
      .gte("first_seen_date", rollingWeekStart),
    supabase
      .from("job_postings")
      .select("*, companies!inner(tier)", { count: "exact", head: true })
      .in("companies.tier", tierList)
      .gte("closed_date", rollingWeekStart),
  ]);

  const filteredNew = (newJobs ?? []).filter(
    (job) => !isBackfill(job.company_id, job.first_seen_date, cutoffs)
  );

  return {
    newCount: filteredNew.length,
    closedCount: closedCount ?? 0,
  };
}

// ============================================================================
// v2 helpers — Companies index, company drill-down, Jobs page right rail
// ============================================================================

export type PivotKind = "new" | "accel" | "quiet" | "cont";
export type PivotSignal = { kind: PivotKind; label: string };

const ACCEL_RATIO = 2; // 4w count must exceed (avg(4w over 12w window)) * 2
const COLD_START_DAYS = 180; // 6 months of silence before "cold start"
const QUIET_DAYS = 30; // sustained-baseline group going to zero for this long

/**
 * Per-week posting counts for the last `weeks` weeks (oldest → newest)
 * for one company. Used to power the small inline Sparkline on the
 * Companies index row.
 */
export async function getCompanyHiringSparkline(
  companyId: string,
  weeks: number = 8,
  client?: SupabaseLike
): Promise<number[]> {
  const supabase = client ?? (await createClient());
  const startDate = subDays(new Date(), weeks * 7).toISOString();

  const { data: jobs } = await supabase
    .from("job_postings")
    .select("first_seen_date")
    .eq("company_id", companyId)
    .gte("first_seen_date", startDate)
    .not("first_seen_date", "is", null);

  // Bucket by week-start (Monday).
  const buckets = new Map<string, number>();
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = startOfWeek(subDays(new Date(), i * 7), { weekStartsOn: 1 });
    buckets.set(ws.toISOString(), 0);
  }

  for (const job of jobs ?? []) {
    if (!job.first_seen_date) continue;
    const ws = startOfWeek(parseISO(job.first_seen_date), { weekStartsOn: 1 });
    const key = ws.toISOString();
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, n]) => n);
}

/**
 * Net new postings in the last `days` days for one company.
 * If `closed_date` is populated, subtracts closures in the same window.
 */
export async function getCompanyHiringDelta(
  companyId: string,
  days: number = 30,
  client?: SupabaseLike
): Promise<number> {
  const supabase = client ?? (await createClient());
  const startDate = subDays(new Date(), days).toISOString();

  const [{ count: newCount }, { count: closedCount }] = await Promise.all([
    supabase
      .from("job_postings")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("first_seen_date", startDate),
    supabase
      .from("job_postings")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("closed_date", startDate),
  ]);

  return (newCount ?? 0) - (closedCount ?? 0);
}

/**
 * Classify a company's overall hiring pivot using three rules over the
 * function-group breakdown of their last ~12 weeks of postings:
 *
 *   1. accel — any group's 4w count > 2× its 12w baseline (per-week avg × 4)
 *   2. new   — first posting in a group in 6+ months (cold start)
 *   3. quiet — group with sustained baseline drops to 0 for 30+ days
 *   4. cont  — none of the above
 *
 * Row-level kind precedence: new > accel > quiet > cont.
 */
export async function classifyCompanyPivot(
  companyId: string,
  client?: SupabaseLike
): Promise<{ kind: PivotKind; signals: PivotSignal[] }> {
  const supabase = client ?? (await createClient());
  const longWindowStart = subDays(new Date(), COLD_START_DAYS).toISOString();
  const recent4wStart = subDays(new Date(), 28);
  const recent12wStart = subDays(new Date(), 84);

  const { data: jobs } = await supabase
    .from("job_postings")
    .select("function_category, first_seen_date")
    .eq("company_id", companyId)
    .gte("first_seen_date", longWindowStart)
    .not("function_category", "is", null)
    .not("first_seen_date", "is", null);

  const allByGroup = new Map<string, Date[]>();
  for (const job of jobs ?? []) {
    if (!job.function_category || !job.first_seen_date) continue;
    const group = getCategoryGroup(job.function_category as RoleCategory);
    if (!allByGroup.has(group)) allByGroup.set(group, []);
    allByGroup.get(group)!.push(parseISO(job.first_seen_date));
  }

  const signals: PivotSignal[] = [];

  for (const [group, dates] of allByGroup.entries()) {
    const last4w = dates.filter((d) => d >= recent4wStart).length;
    const last12w = dates.filter((d) => d >= recent12wStart).length;
    const baseline4w = (last12w / 12) * 4; // avg per 4w over 12w window

    // Accelerating
    if (baseline4w >= 1 && last4w > baseline4w * ACCEL_RATIO) {
      signals.push({ kind: "accel", label: `${group} accelerating` });
    }

    // Cold start: first posting in 6+ months means the only postings in the
    // window are concentrated near "now". A simple proxy: nothing older than
    // 5 months but at least one in the last 4 weeks.
    const oldest = dates.reduce(
      (acc, d) => (d < acc ? d : acc),
      new Date()
    );
    const fiveMonthsAgo = subDays(new Date(), 150);
    if (last4w > 0 && oldest > fiveMonthsAgo && dates.length === last4w) {
      signals.push({ kind: "new", label: `${group} cold start` });
    }

    // Going quiet: had a sustained baseline (≥4 in the prior 12w) but
    // nothing in the last 30 days.
    const last30dStart = subDays(new Date(), QUIET_DAYS);
    const last30d = dates.filter((d) => d >= last30dStart).length;
    if (last12w >= 4 && last30d === 0) {
      signals.push({ kind: "quiet", label: `${group} going quiet` });
    }
  }

  // Row-level kind precedence
  let kind: PivotKind = "cont";
  if (signals.some((s) => s.kind === "new")) kind = "new";
  else if (signals.some((s) => s.kind === "accel")) kind = "accel";
  else if (signals.some((s) => s.kind === "quiet")) kind = "quiet";

  return { kind, signals };
}

/**
 * Most recent meaningful event for a company. Priority:
 *   1. companies.last_change + last_change_at (editor-curated)
 *   2. Most recent posting_events row (if populated)
 *   3. Most recent job_postings.first_seen_date — labeled "New posting"
 */
export async function getCompanyLastChange(
  companyId: string,
  client?: SupabaseLike
): Promise<{ text: string; when: string } | null> {
  const supabase = client ?? (await createClient());

  // Editor-curated
  const { data: company } = await supabase
    .from("companies")
    .select("last_change, last_change_at")
    .eq("id", companyId)
    .maybeSingle();

  if (company?.last_change) {
    return {
      text: company.last_change,
      when: company.last_change_at
        ? relativeWhen(parseISO(company.last_change_at as string))
        : "—",
    };
  }

  // posting_events feed (best-effort; table may not be populated)
  try {
    const { data: events } = await supabase
      .from("posting_events")
      .select("event_type, occurred_at, summary")
      .eq("company_id", companyId)
      .order("occurred_at", { ascending: false })
      .limit(1);
    const ev = events?.[0] as
      | { event_type?: string; occurred_at?: string; summary?: string }
      | undefined;
    if (ev?.occurred_at) {
      return {
        text: ev.summary ?? ev.event_type ?? "Posting event",
        when: relativeWhen(parseISO(ev.occurred_at)),
      };
    }
  } catch {
    // table may not exist in all envs; fall through
  }

  // Fallback: most recent job_postings.first_seen_date
  const { data: latestJob } = await supabase
    .from("job_postings")
    .select("first_seen_date")
    .eq("company_id", companyId)
    .not("first_seen_date", "is", null)
    .order("first_seen_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestJob?.first_seen_date) {
    return {
      text: "New posting",
      when: relativeWhen(parseISO(latestJob.first_seen_date)),
    };
  }

  return null;
}

function relativeWhen(date: Date): string {
  const ms = Date.now() - date.getTime();
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  if (days < 14) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

/**
 * Function-heat strip data for the Jobs page right rail.
 * Returns 6 rows (top 6 groups by raw new-posting count in window).
 */
export async function getFunctionHeatData(
  days: number = 30,
  tiers: readonly CompanyTier[] = DEFAULT_TIERS
): Promise<
  Array<{
    name: string;
    val: number;
    max: number;
    kind: "new" | "accel" | "default";
  }>
> {
  const supabase = await createClient();
  const recent = subDays(new Date(), days).toISOString();
  const recent4wStart = subDays(new Date(), 28);
  const recent12wStart = subDays(new Date(), 84);
  const longWindowStart = subDays(new Date(), COLD_START_DAYS).toISOString();
  const tierList = [...tiers];

  const [{ data: recentJobs }, { data: longRangeJobs }] = await Promise.all([
    supabase
      .from("job_postings")
      .select("function_category, first_seen_date, companies!inner(tier)")
      .in("companies.tier", tierList)
      .gte("first_seen_date", recent)
      .not("function_category", "is", null),
    supabase
      .from("job_postings")
      .select("function_category, first_seen_date, companies!inner(tier)")
      .in("companies.tier", tierList)
      .gte("first_seen_date", longWindowStart)
      .not("function_category", "is", null)
      .not("first_seen_date", "is", null),
  ]);

  // Recent counts by group
  const recentByGroup = new Map<string, number>();
  for (const job of recentJobs ?? []) {
    if (!job.function_category) continue;
    const group = getCategoryGroup(job.function_category as RoleCategory);
    recentByGroup.set(group, (recentByGroup.get(group) || 0) + 1);
  }

  // Per-group windows for accel / cold-start classification
  const longByGroup = new Map<string, Date[]>();
  for (const job of longRangeJobs ?? []) {
    if (!job.function_category || !job.first_seen_date) continue;
    const group = getCategoryGroup(job.function_category as RoleCategory);
    if (!longByGroup.has(group)) longByGroup.set(group, []);
    longByGroup.get(group)!.push(parseISO(job.first_seen_date));
  }

  const max = Math.max(1, ...Array.from(recentByGroup.values()));

  const rows = Array.from(recentByGroup.entries())
    .map(([name, val]) => {
      const dates = longByGroup.get(name) ?? [];
      const last4w = dates.filter((d) => d >= recent4wStart).length;
      const last12w = dates.filter((d) => d >= recent12wStart).length;
      const baseline4w = (last12w / 12) * 4;

      const fiveMonthsAgo = subDays(new Date(), 150);
      const oldest = dates.reduce(
        (acc, d) => (d < acc ? d : acc),
        new Date()
      );
      const isColdStart =
        last4w > 0 && oldest > fiveMonthsAgo && dates.length === last4w;
      const isAccel = baseline4w >= 1 && last4w > baseline4w * ACCEL_RATIO;

      const kind: "new" | "accel" | "default" = isColdStart
        ? "new"
        : isAccel
        ? "accel"
        : "default";

      return { name, val, max, kind };
    })
    .sort((a, b) => b.val - a.val)
    .slice(0, 6);

  return rows;
}

/**
 * Cross-company themes for the Jobs page right rail.
 *
 * Counts come from job_postings (function-group rollup, ≥2 companies). The
 * editorial `label` and `description` are author-quality strings cached in
 * the `cross_company_themes` table by `web/lib/analysis/cross-company-themes.ts`.
 * When the cache is empty we fall back to the raw group key — the UI handles
 * either shape.
 */
export interface CrossCompanyThemeRow {
  /** Function-group key — stable identifier ("engineering", "operations-strategy"). */
  name: string;
  /** Editorial label when one has been generated; otherwise the group key title-cased. */
  label: string | null;
  /** One-sentence editorial description; null until the labeler runs. */
  description: string | null;
  cos: number;
  roles: number;
}

export async function getCrossCompanyThemes(
  tiers: readonly CompanyTier[] = DEFAULT_TIERS
): Promise<CrossCompanyThemeRow[]> {
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from("job_postings")
    .select(
      "company_id, function_category, is_active, companies!inner(is_active, tier)"
    )
    .eq("is_active", true)
    .eq("companies.is_active", true)
    .in("companies.tier", [...tiers])
    .not("function_category", "is", null);

  const themeStats = new Map<string, { cos: Set<string>; roles: number }>();
  for (const job of jobs ?? []) {
    if (!job.function_category) continue;
    const group = getCategoryGroup(job.function_category as RoleCategory);
    if (!themeStats.has(group)) {
      themeStats.set(group, { cos: new Set(), roles: 0 });
    }
    const entry = themeStats.get(group)!;
    entry.cos.add(job.company_id);
    entry.roles += 1;
  }

  const counts = Array.from(themeStats.entries())
    .map(([name, { cos, roles }]) => ({ name, cos: cos.size, roles }))
    .filter((row) => row.cos >= 2)
    .sort((a, b) => b.cos - a.cos || b.roles - a.roles)
    .slice(0, 5);

  if (counts.length === 0) return [];

  const { data: cachedLabels } = await supabase
    .from("cross_company_themes")
    .select("category_group, label, description")
    .in(
      "category_group",
      counts.map((c) => c.name)
    );

  const byGroup = new Map<string, { label: string; description: string | null }>();
  for (const row of cachedLabels ?? []) {
    byGroup.set(row.category_group as string, {
      label: row.label as string,
      description: (row.description as string | null) ?? null,
    });
  }

  return counts.map((row) => {
    const cached = byGroup.get(row.name);
    return {
      name: row.name,
      label: cached?.label ?? null,
      description: cached?.description ?? null,
      cos: row.cos,
      roles: row.roles,
    };
  });
}

/**
 * Row shape returned by `getJobsListData` — what the v2 Jobs page table
 * needs for one row. `functionGroup` is the high-level group label (e.g.
 * "Engineering"), `keywords` is the structure-extracted keyword array used
 * to render up to 3 SignalTag chips, and `ageDays` is precomputed from
 * `firstSeenDate` so the client can sort and chip-filter without
 * recomputing.
 */
export interface JobsListRow {
  id: string;
  title: string;
  companyName: string;
  companySlug: string;
  companyId: string;
  /** Owning company's tier — drives the <TierBadge> on incumbent rows. */
  companyTier: "fintech" | "incumbent";
  functionCategory: string | null;
  functionGroup: string | null;
  location: string | null;
  locationStructured: {
    city: string | null;
    state: string | null;
    country: string | null;
    formatted: string | null;
  } | null;
  firstSeenDate: string | null;
  isActive: boolean;
  keywords: string[];
  ageDays: number | null;
  standardizedDepartment: string | null;
}

interface JobsListRawRow {
  id: string;
  title: string;
  standardized_department: string | null;
  function_category: string | null;
  location: string | null;
  location_structured: unknown;
  is_active: boolean;
  first_seen_date: string | null;
  keywords: unknown;
  company_id: string;
  companies:
    | { id: string; name: string; slug: string; tier: string }
    | { id: string; name: string; slug: string; tier: string }[]
    | null;
}

function coerceLocationStructured(
  raw: unknown
): JobsListRow["locationStructured"] {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    city: typeof r.city === "string" ? r.city : null,
    state: typeof r.state === "string" ? r.state : null,
    country: typeof r.country === "string" ? r.country : null,
    formatted: typeof r.formatted === "string" ? r.formatted : null,
  };
}

function coerceKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.length > 0);
}

/**
 * Fetch all job rows for the standalone Jobs page (`/jobs`). Optionally
 * scope to an explicit set of job IDs — used when entering from a digest
 * deep link that captured a specific snapshot of jobs (the
 * `weekly_digest_companies.job_ids` payload).
 *
 * Tier-filtered (default fintech-only) via an inner join on companies, so
 * incumbent (big-bank) postings do not flood the Jobs list, its company
 * dropdown, or the eyebrow stats. The Jobs-page Tier toggle opts in by
 * passing `tiers` explicitly.
 *
 * Two row caps:
 *   - Default browse (no search): `JOBS_LIST_MAX_ROWS` (500). Without a cap,
 *     `?tier=incumbent` / `?tier=all` would ship the ~7k-row active corpus
 *     each render.
 *   - Search (`searchQuery` set): `JOBS_LIST_SEARCH_MAX_ROWS` (1000). Lifts
 *     the cap so descriptions older than the 500th most recent can still
 *     match. When the cap is hit, `truncated: true` so the UI can warn.
 *
 * When `searchQuery` is set, the match is pushed into Postgres full-text
 * search against the `search_tsv` generated column (title=A, location=B,
 * description_text=C), GIN-indexed — see migration
 * `20260528120000_jobs_search_tsvector.sql`. `buildSearchTsQuery` turns the
 * user's input into a `tsquery` (see its docblock for the supported syntax),
 * and the `@@` match reads pre-lexemed tokens from the index with no big-text
 * recheck (≈10ms even for broad terms on the incumbent corpus, vs ~1.3s for
 * the equivalent trigram ILIKE).
 */
export const JOBS_LIST_MAX_ROWS = 500;
export const JOBS_LIST_SEARCH_MAX_ROWS = 1000;

export interface JobsListResult {
  rows: JobsListRow[];
  /** True when the search hit `JOBS_LIST_SEARCH_MAX_ROWS` — older matches
   *  were not returned. The UI surfaces a banner so users can refine. */
  truncated: boolean;
}

/** Max raw characters of search input we parse (phrases make queries longer
 *  than the bare-word case, so this is roomier than a single term). */
const SEARCH_INPUT_MAX_CHARS = 120;
/** Cap on parsed groups, so a pathological query can't build a huge tsquery. */
const SEARCH_MAX_GROUPS = 12;

/** Strip a single token down to its safe lexeme content: letters, digits and
 *  internal hyphens only. Everything else (the structural quote/operator
 *  characters we parse separately, plus punctuation) is dropped. */
function sanitizeLexeme(token: string): string {
  return token.normalize("NFKC").replace(/[^\p{L}\p{N}-]/gu, "");
}

/**
 * Turn a user's free-text search box input into a Postgres `tsquery` string.
 *
 * Supported syntax (taught in the Jobs search help popover — keep the two in
 * sync):
 *   - `staff engineer`     → all words must appear (AND). Each word is matched
 *                            as a prefix (`staff:* & engineer:*`) so partial
 *                            words match while you type.
 *   - `"staff engineer"`   → exact phrase: the words must be adjacent, in
 *                            order (`staff <-> engineer`).
 *   - `engineer -contract` → exclude: roles matching `contract` are removed
 *                            (`engineer:* & !contract:*`).
 *
 * We construct every tsquery operator ourselves (`:*`, `&`, `<->`, `!`) and
 * feed `to_tsquery` only sanitized alnum lexemes, so a user cannot inject
 * tsquery syntax or break the parse. An unterminated quote (mid-type, e.g.
 * `"staff eng`) is treated as a phrase whose last word is still being typed,
 * so it keeps its prefix marker. Returns "" when nothing searchable survives.
 */
function buildSearchTsQuery(raw: string): string {
  const input = raw.normalize("NFKC").slice(0, SEARCH_INPUT_MAX_CHARS);

  // Split into groups: a quoted run is one group; each bare word is its own
  // group. Capture the leading `-` (negation) and whether a quote closed.
  type Group = { words: string[]; phrase: boolean; negate: boolean; open: boolean };
  const groups: Group[] = [];
  // Alt 1 = quoted run: m[1]=neg, m[2]=inner text, m[3]=closing quote ("" if
  // unterminated). Alt 2 = bare token: m[4]=neg, m[5]=token (may be hyphenated).
  const tokenRe = /(-?)"([^"]*)("?)|(-?)(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(input)) && groups.length < SEARCH_MAX_GROUPS) {
    if (m[2] !== undefined) {
      const words = m[2].split(/[\s-]+/).map(sanitizeLexeme).filter(Boolean);
      if (words.length) {
        groups.push({ words, phrase: true, negate: m[1] === "-", open: m[3] === "" });
      }
    } else if (m[5] !== undefined) {
      // A hyphenated bare token expands to several AND-ed prefix words.
      const words = m[5].split(/[\s-]+/).map(sanitizeLexeme).filter(Boolean);
      for (const w of words) {
        groups.push({ words: [w], phrase: false, negate: m[4] === "-", open: true });
      }
    }
  }

  const parts = groups
    .map((g) => {
      if (!g.words.length) return "";
      let expr: string;
      if (g.phrase) {
        // Adjacent words via FOLLOWED-BY. Prefix only the last word when the
        // phrase is still being typed (unterminated quote).
        expr = g.words
          .map((w, i) => (g.open && i === g.words.length - 1 ? `${w}:*` : w))
          .join(" <-> ");
        if (g.words.length > 1) expr = `(${expr})`;
      } else {
        // Bare word: always prefix-matched for type-ahead.
        expr = `${g.words[0]}:*`;
      }
      return g.negate ? `!${expr}` : expr;
    })
    .filter(Boolean);

  return parts.join(" & ");
}

export async function getJobsListData(
  options: {
    jobIds?: string[] | null;
    tiers?: readonly CompanyTier[];
    searchQuery?: string | null;
  } = {}
): Promise<JobsListResult> {
  const supabase = await createClient();

  // Digest snapshot with no captured jobs — short-circuit.
  if (options.jobIds !== undefined && options.jobIds !== null && options.jobIds.length === 0) {
    return { rows: [], truncated: false };
  }

  const tierList = [...(options.tiers ?? DEFAULT_TIERS)];
  const tsQuery = options.searchQuery ? buildSearchTsQuery(options.searchQuery) : "";
  const hasSearch = tsQuery.length > 0;
  const limit = hasSearch ? JOBS_LIST_SEARCH_MAX_ROWS : JOBS_LIST_MAX_ROWS;

  let query = supabase
    .from("job_postings")
    .select(
      "id, title, standardized_department, function_category, location, location_structured, is_active, first_seen_date, keywords, company_id, companies!inner(id, name, slug, tier)"
    )
    .in("companies.tier", tierList)
    .order("first_seen_date", { ascending: false })
    .limit(limit);

  if (hasSearch) {
    // Full-text match on the GIN-indexed search_tsv column. Default fts type
    // maps to `@@ to_tsquery(english, ...)`, which honours our `:*` prefix
    // markers — so partial words typed mid-search still match.
    query = query.textSearch("search_tsv", tsQuery, { config: "english" });
  }

  if (options.jobIds && options.jobIds.length > 0) {
    query = query.in("id", options.jobIds);
  }

  const startedAt = performance.now();
  const { data, error } = await query;
  const durationMs = Math.round(performance.now() - startedAt);

  if (hasSearch) {
    log.info(
      {
        ts_query: tsQuery,
        result_count: data?.length ?? 0,
        truncated: (data?.length ?? 0) >= limit,
        duration_ms: durationMs,
        has_error: Boolean(error),
      },
      "jobs.search"
    );
  }

  if (error || !data) return { rows: [], truncated: false };

  const now = Date.now();
  const rows: JobsListRow[] = (data as JobsListRawRow[]).map((j) => {
    const company = Array.isArray(j.companies) ? j.companies[0] : j.companies;
    const ageDays = j.first_seen_date
      ? Math.max(
          0,
          Math.floor((now - new Date(j.first_seen_date).getTime()) / 86_400_000)
        )
      : null;
    const functionGroup =
      j.function_category &&
      (ROLE_CATEGORIES as readonly string[]).includes(j.function_category)
        ? getCategoryGroup(j.function_category as RoleCategory)
        : null;
    return {
      id: j.id,
      title: j.title,
      companyName: company?.name ?? "—",
      companySlug: company?.slug ?? "",
      companyId: j.company_id,
      companyTier: company?.tier === "incumbent" ? "incumbent" : "fintech",
      functionCategory: j.function_category,
      functionGroup,
      location: j.location,
      locationStructured: coerceLocationStructured(j.location_structured),
      firstSeenDate: j.first_seen_date,
      isActive: j.is_active,
      keywords: coerceKeywords(j.keywords),
      ageDays,
      standardizedDepartment: j.standardized_department,
    };
  });

  return { rows, truncated: hasSearch && rows.length >= limit };
}

// ============================================================================
// Incumbent Bets — senior big-bank hiring signal (Phase 2)
// ============================================================================

/** One role group inside a bank's Incumbent Bets list. Identical postings
 *  (same title + location) collapse into a single row with a `count`. */
export interface IncumbentBetRole {
  title: string;
  seniority: string | null;
  functionCategory: string | null;
  location: string | null;
  /** How many postings collapsed into this row. */
  count: number;
  /** A representative posting id, for deep-linking. */
  sampleJobId: string;
}

/** One bank's worth of Incumbent Bets data. */
export interface IncumbentBetCompany {
  companyId: string;
  companyName: string;
  companySlug: string;
  /** Signal roles (staff+ in AI/ML / Data / Risk-AI), grouped + sorted. */
  roles: IncumbentBetRole[];
  /** Total signal roles = sum of role `count`s. */
  signalRoleCount: number;
  /** ALL active postings for this bank — for the company-detail page's
   *  honest "1,487 total · 9 senior" line. Not shown on the rail. */
  totalOpenJobs: number;
}

const INCUMBENT_BETS_WINDOW_DAYS = 30;

/**
 * Senior big-bank hiring signal for the "Incumbent Bets" dashboard rail
 * and the per-company "Senior hiring signal" panel.
 *
 * Returns only `tier='incumbent'` companies, only their high-signal roles
 * (`isIncumbentSignalJob` — staff+ in AI/ML / Data / Risk-AI) first seen in
 * the last 30 days. Reads structured fields only — no AI. Banks with no
 * qualifying role in the window are omitted entirely (the rail renders
 * nothing rather than an empty card).
 *
 * @param options.companyId  Scope to one bank (the company-detail panel).
 * @param options.windowDays Override the 30-day signal window.
 */
export async function getIncumbentBets(options?: {
  companyId?: string;
  windowDays?: number;
}): Promise<IncumbentBetCompany[]> {
  const supabase = await createClient();
  const windowDays = options?.windowDays ?? INCUMBENT_BETS_WINDOW_DAYS;
  const windowStart = subDays(new Date(), windowDays).toISOString();

  // Signal-window jobs: active incumbent postings first seen in the window.
  // Paginated because the unbounded .select() previously hit PostgREST's
  // 1000-row default cap — incumbents carry ~6,000+ active postings, so
  // the rail silently rendered partial data.
  type SignalRow = {
    id: string;
    title: string | null;
    seniority_level: string | null;
    function_category: string | null;
    location: string | null;
    company_id: string;
    companies: { id: string; name: string; slug: string; is_active: boolean; tier: string | null } |
      Array<{ id: string; name: string; slug: string; is_active: boolean; tier: string | null }>;
  };
  const PAGE = 1000;
  const signalJobs: SignalRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from("job_postings")
      .select(
        "id, title, seniority_level, function_category, location, company_id, companies!inner(id, name, slug, is_active, tier)"
      )
      .eq("is_active", true)
      .eq("companies.is_active", true)
      .eq("companies.tier", "incumbent")
      .gte("first_seen_date", windowStart)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (options?.companyId) {
      q = q.eq("company_id", options.companyId);
    }
    const { data: page } = await q;
    if (!page || page.length === 0) break;
    signalJobs.push(...(page as SignalRow[]));
    if (page.length < PAGE) break;
  }

  // Per-company active totals via count() — no row materialization, no cap.
  // Only the 6 incumbents are eligible, so this is at most ~6 round-trips.
  const totalOpenByCompany = new Map<string, number>();
  const { data: incumbentCompanies } = await supabase
    .from("companies")
    .select("id")
    .eq("is_active", true)
    .eq("tier", "incumbent");
  const eligibleIds = (incumbentCompanies ?? [])
    .map((c) => c.id as string)
    .filter((id) => !options?.companyId || id === options.companyId);
  await Promise.all(
    eligibleIds.map(async (cid) => {
      const { count } = await supabase
        .from("job_postings")
        .select("id", { count: "exact", head: true })
        .eq("company_id", cid)
        .eq("is_active", true);
      totalOpenByCompany.set(cid, count ?? 0);
    })
  );

  // Group signal jobs by company, then collapse identical roles.
  interface CompanyAccum {
    companyId: string;
    companyName: string;
    companySlug: string;
    roleGroups: Map<string, IncumbentBetRole>;
  }
  const byCompany = new Map<string, CompanyAccum>();

  for (const job of signalJobs ?? []) {
    if (
      !isIncumbentSignalJob({
        seniority_level: job.seniority_level,
        function_category: job.function_category,
      })
    ) {
      continue;
    }
    const company = Array.isArray(job.companies)
      ? job.companies[0]
      : job.companies;
    if (!company) continue;

    let accum = byCompany.get(job.company_id);
    if (!accum) {
      accum = {
        companyId: job.company_id,
        companyName: (company as { name: string }).name,
        companySlug: (company as { slug: string }).slug,
        roleGroups: new Map(),
      };
      byCompany.set(job.company_id, accum);
    }

    // Collapse identical postings: same title (normalized) + location.
    const title = (job.title ?? "").trim();
    const location = job.location ?? null;
    const key = `${title.toLowerCase()}|${(location ?? "").toLowerCase()}`;
    const existing = accum.roleGroups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      accum.roleGroups.set(key, {
        title,
        seniority: job.seniority_level ?? null,
        functionCategory: job.function_category ?? null,
        location,
        count: 1,
        sampleJobId: job.id,
      });
    }
  }

  const result: IncumbentBetCompany[] = Array.from(byCompany.values()).map(
    (accum) => {
      const roles = Array.from(accum.roleGroups.values()).sort(
        (a, b) => b.count - a.count || a.title.localeCompare(b.title)
      );
      const signalRoleCount = roles.reduce((sum, r) => sum + r.count, 0);
      return {
        companyId: accum.companyId,
        companyName: accum.companyName,
        companySlug: accum.companySlug,
        roles,
        signalRoleCount,
        totalOpenJobs: totalOpenByCompany.get(accum.companyId) ?? 0,
      };
    }
  );

  // Banks sorted by signal volume — the bank investing most is read first.
  return result.sort((a, b) => b.signalRoleCount - a.signalRoleCount);
}

// ============================================================================
// v2 — Company drill-down (Stream L)
// ============================================================================

export type BetEvidenceType = "internal" | "external";

export interface CompanyBetEvidence {
  when: string;
  text: string;
  type: BetEvidenceType;
}

export interface CompanyBet {
  id: string;
  title: string;
  claim: string;
  pivot: PivotKind;
  pivot_label?: string;
  confidence: 1 | 2 | 3 | 4 | 5;
  evidence: CompanyBetEvidence[];
  forward_signal: string;
  job_filter?: { function?: string; theme?: string };
}

export interface CompanyBetJob {
  id: string;
  title: string;
  functionCategory: string | null;
  functionGroup: string | null;
  location: string | null;
  firstSeenDate: string | null;
  isActive: boolean;
  ageDays: number | null;
  ageLabel: string;
  keywords: string[];
  url: string | null;
  isNew: boolean;
}

export interface CompanyBetWithJobs extends CompanyBet {
  jobs: CompanyBetJob[];
  jobsCount: number;
}

interface CompanyDrillDownRow {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  ats_type: string | null;
  ats_identifier: string | null;
  careers_url: string | null;
  thesis: string | null;
  thesis_sub: string | null;
  interpretation: string | null;
  bets: unknown;
  last_change: string | null;
  last_change_at: string | null;
  is_active: boolean;
  created_at: string | null;
  tech_stack: unknown;
  tech_stack_generated_at: string | null;
}

export interface CompanyDrillDownData {
  company: CompanyDrillDownRow;
  bets: CompanyBetWithJobs[];
  activeJobCount: number;
  hiringDelta: number;
  newPatternsCount: number;
  rolesPerBet: number;
  thesisAgo: string | null;
}

function coerceBetEvidence(raw: unknown): CompanyBetEvidence[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      if (!e || typeof e !== "object") return null;
      const r = e as Record<string, unknown>;
      const type = r.type === "external" ? "external" : "internal";
      return {
        when: typeof r.when === "string" ? r.when : "",
        text: typeof r.text === "string" ? r.text : "",
        type,
      } as CompanyBetEvidence;
    })
    .filter((e): e is CompanyBetEvidence => e !== null);
}

function coerceBets(raw: unknown): CompanyBet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b, idx) => {
      if (!b || typeof b !== "object") return null;
      const r = b as Record<string, unknown>;
      const pivotRaw = typeof r.pivot === "string" ? r.pivot : "cont";
      const pivot: PivotKind =
        pivotRaw === "new" ||
        pivotRaw === "accel" ||
        pivotRaw === "quiet" ||
        pivotRaw === "cont"
          ? pivotRaw
          : "cont";
      const confRaw = typeof r.confidence === "number" ? r.confidence : 3;
      const confidence = (Math.min(5, Math.max(1, Math.round(confRaw))) as
        | 1
        | 2
        | 3
        | 4
        | 5);
      const filterRaw =
        r.job_filter && typeof r.job_filter === "object"
          ? (r.job_filter as Record<string, unknown>)
          : undefined;
      const job_filter = filterRaw
        ? {
            function:
              typeof filterRaw.function === "string"
                ? filterRaw.function
                : undefined,
            theme:
              typeof filterRaw.theme === "string"
                ? filterRaw.theme
                : undefined,
          }
        : undefined;
      return {
        id: typeof r.id === "string" && r.id ? r.id : `bet-${idx}`,
        title: typeof r.title === "string" ? r.title : "",
        claim: typeof r.claim === "string" ? r.claim : "",
        pivot,
        pivot_label:
          typeof r.pivot_label === "string" ? r.pivot_label : undefined,
        confidence,
        evidence: coerceBetEvidence(r.evidence),
        forward_signal:
          typeof r.forward_signal === "string" ? r.forward_signal : "",
        job_filter,
      } as CompanyBet;
    })
    .filter((b): b is CompanyBet => b !== null);
}

function ageLabelFromDate(date: string | null, now: number): string {
  if (!date) return "—";
  const ms = now - new Date(date).getTime();
  const days = Math.max(0, Math.floor(ms / 86_400_000));
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  if (days < 14) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function matchesJobFilter(
  job: {
    function_category: string | null;
    standardized_department: string | null;
    keywords: string[];
    title: string;
    functionGroup: string | null;
  },
  filter: { function?: string; theme?: string } | undefined
): boolean {
  if (!filter || (!filter.function && !filter.theme)) return false;

  let fnPass = true;
  if (filter.function) {
    const want = filter.function.toLowerCase().trim();
    const candidates = [
      job.functionGroup ?? "",
      job.function_category ?? "",
      job.standardized_department ?? "",
    ]
      .map((s) => s.toLowerCase())
      .filter((s) => s.length > 0);
    fnPass = candidates.some(
      (c) => c === want || c.includes(want) || want.includes(c)
    );
  }

  let themePass = true;
  if (filter.theme) {
    const want = filter.theme.toLowerCase().trim();
    const haystack = [
      job.title.toLowerCase(),
      ...job.keywords.map((k) => k.toLowerCase()),
    ];
    themePass = haystack.some((h) => h.includes(want));
  }

  return fnPass && themePass;
}

interface RawCompanyJob {
  id: string;
  title: string;
  function_category: string | null;
  standardized_department: string | null;
  location: string | null;
  is_active: boolean;
  first_seen_date: string | null;
  keywords: unknown;
  url: string | null;
}

function shapeCompanyJob(raw: RawCompanyJob, now: number): CompanyBetJob & {
  function_category: string | null;
  standardized_department: string | null;
} {
  const keywords = coerceKeywords(raw.keywords);
  const ageDays = raw.first_seen_date
    ? Math.max(
        0,
        Math.floor((now - new Date(raw.first_seen_date).getTime()) / 86_400_000)
      )
    : null;
  const functionGroup =
    raw.function_category &&
    (ROLE_CATEGORIES as readonly string[]).includes(raw.function_category)
      ? getCategoryGroup(raw.function_category as RoleCategory)
      : null;
  const isNew = ageDays !== null && ageDays <= 7;
  return {
    id: raw.id,
    title: raw.title,
    functionCategory: raw.function_category,
    functionGroup,
    location: raw.location,
    firstSeenDate: raw.first_seen_date,
    isActive: raw.is_active,
    ageDays,
    ageLabel: ageLabelFromDate(raw.first_seen_date, now),
    keywords,
    url: raw.url,
    isNew,
    function_category: raw.function_category,
    standardized_department: raw.standardized_department,
  };
}

/**
 * Return all active jobs at a company that match a bet's `job_filter`.
 * If both `function` and `theme` are set, both must match (AND).
 * If neither is set, returns an empty array (which the UI interprets as
 * "this bet has no associated hiring yet — that's the signal").
 */
export async function getJobsForBet(
  companyId: string,
  jobFilter: { function?: string; theme?: string }
): Promise<CompanyBetJob[]> {
  if (!jobFilter || (!jobFilter.function && !jobFilter.theme)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("job_postings")
    .select(
      "id, title, function_category, standardized_department, location, is_active, first_seen_date, keywords, url"
    )
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("first_seen_date", { ascending: false });

  const now = Date.now();
  const shaped = (data as RawCompanyJob[] | null)?.map((r) =>
    shapeCompanyJob(r, now)
  ) ?? [];

  return shaped
    .filter((j) =>
      matchesJobFilter(
        {
          function_category: j.function_category,
          standardized_department: j.standardized_department,
          keywords: j.keywords,
          title: j.title,
          functionGroup: j.functionGroup,
        },
        jobFilter
      )
    )
    .map(({ function_category: _fc, standardized_department: _sd, ...rest }) => {
      void _fc;
      void _sd;
      return rest as CompanyBetJob;
    });
}

/**
 * Single helper for the company drill-down page: fetches the company row,
 * normalises the bets payload, fetches every active job once, and assigns
 * each job to the matching bets. Also computes the metric strip values
 * (active count, 30d net new, new-pattern count, roles/bet ratio) and the
 * "updated Xd ago" label for the thesis.
 */
export async function getCompanyDrillDownData(
  slug: string
): Promise<CompanyDrillDownData | null> {
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, name, slug, country, ats_type, ats_identifier, careers_url, thesis, thesis_sub, interpretation, bets, last_change, last_change_at, is_active, created_at, tech_stack, tech_stack_generated_at"
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!company) return null;

  const co = company as CompanyDrillDownRow;
  const bets = coerceBets(co.bets);

  const { data: jobsRaw } = await supabase
    .from("job_postings")
    .select(
      "id, title, function_category, standardized_department, location, is_active, first_seen_date, keywords, url"
    )
    .eq("company_id", co.id)
    .eq("is_active", true)
    .order("first_seen_date", { ascending: false });

  const now = Date.now();
  const shapedJobs = (jobsRaw as RawCompanyJob[] | null)?.map((r) =>
    shapeCompanyJob(r, now)
  ) ?? [];

  const betsWithJobs: CompanyBetWithJobs[] = bets.map((bet) => {
    const matched = shapedJobs
      .filter((j) =>
        matchesJobFilter(
          {
            function_category: j.function_category,
            standardized_department: j.standardized_department,
            keywords: j.keywords,
            title: j.title,
            functionGroup: j.functionGroup,
          },
          bet.job_filter
        )
      )
      .map(({ function_category: _fc, standardized_department: _sd, ...rest }) => {
        void _fc;
        void _sd;
        return rest as CompanyBetJob;
      });
    return { ...bet, jobs: matched, jobsCount: matched.length };
  });

  const activeJobCount = shapedJobs.length;
  const hiringDelta = await getCompanyHiringDelta(co.id, 30);
  const newPatternsCount = bets.filter((b) => b.pivot === "new").length;
  const rolesPerBet =
    bets.length > 0 ? activeJobCount / bets.length : 0;

  const thesisAgo =
    co.last_change_at != null
      ? relativeWhen(parseISO(co.last_change_at))
      : null;

  return {
    company: co,
    bets: betsWithJobs,
    activeJobCount,
    hiringDelta,
    newPatternsCount,
    rolesPerBet,
    thesisAgo,
  };
}

/**
 * Fetches every active job at a company, plus their bet assignment.
 * Used by the JobsScopeDrawer in `kind: "all"` mode so we can show a
 * little "filed under {bet}" hint per row.
 */
export async function getAllCompanyJobsWithBets(companyId: string): Promise<
  Array<CompanyBetJob & { betId: string | null; betTitle: string | null }>
> {
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("bets")
    .eq("id", companyId)
    .maybeSingle();

  const bets = coerceBets((company as { bets?: unknown } | null)?.bets);

  const { data: jobsRaw } = await supabase
    .from("job_postings")
    .select(
      "id, title, function_category, standardized_department, location, is_active, first_seen_date, keywords, url"
    )
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("first_seen_date", { ascending: false });

  const now = Date.now();
  const shaped = (jobsRaw as RawCompanyJob[] | null)?.map((r) =>
    shapeCompanyJob(r, now)
  ) ?? [];

  return shaped.map((j) => {
    const owner = bets.find((b) =>
      matchesJobFilter(
        {
          function_category: j.function_category,
          standardized_department: j.standardized_department,
          keywords: j.keywords,
          title: j.title,
          functionGroup: j.functionGroup,
        },
        b.job_filter
      )
    );
    const { function_category: _fc, standardized_department: _sd, ...rest } = j;
    void _fc;
    void _sd;
    return {
      ...(rest as CompanyBetJob),
      betId: owner?.id ?? null,
      betTitle: owner?.title ?? null,
    };
  });
}
