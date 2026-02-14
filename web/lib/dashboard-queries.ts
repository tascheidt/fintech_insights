import { createClient } from "@/lib/supabase/server";
import {
  getCategoryGroup,
  RoleCategory,
  CATEGORY_GROUPS,
} from "@/lib/analysis/function-categories";
import { startOfWeek, format, subDays, parseISO, addHours } from "date-fns";

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
 */
export async function getPostingTrends(
  days: number,
  cutoffs: Map<string, Date>
): Promise<WeeklyTrend[]> {
  const supabase = await createClient();
  const startDate = subDays(new Date(), days).toISOString();

  const { data: jobs, error } = await supabase
    .from("job_postings")
    .select("company_id, first_seen_date")
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
 */
export async function getRawFunctionData(
  days: number,
  cutoffs: Map<string, Date>
): Promise<RawFunctionData[]> {
  const supabase = await createClient();
  const startDate = subDays(new Date(), days).toISOString();

  const { data: jobs, error } = await supabase
    .from("job_postings")
    .select("company_id, function_category, first_seen_date")
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
 */
export async function getNetHiringFlow(
  days: number,
  cutoffs: Map<string, Date>
): Promise<NetHiringFlowPoint[]> {
  const supabase = await createClient();
  const startDate = subDays(new Date(), days).toISOString();

  const [{ data: newJobs }, { data: closedJobs }] = await Promise.all([
    supabase
      .from("job_postings")
      .select("company_id, first_seen_date")
      .gte("first_seen_date", startDate)
      .not("first_seen_date", "is", null),
    supabase
      .from("job_postings")
      .select("company_id, first_seen_date, closed_date")
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
 * Get competitive matrix data: active jobs per company per function group.
 * Includes ALL active companies, even those with uncategorized jobs.
 */
export async function getCompetitiveMatrixData(
  cutoffs: Map<string, Date>
): Promise<CompetitiveMatrixRow[]> {
  const supabase = await createClient();
  const oneWeekAgo = subDays(new Date(), 7).toISOString();

  // Fetch all active companies and all active jobs (including uncategorized)
  const [{ data: allCompanies }, { data: jobs }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, slug")
      .eq("is_active", true),
    supabase
      .from("job_postings")
      .select(
        "company_id, function_category, first_seen_date, is_active, companies!inner(id, name, slug, is_active)"
      )
      .eq("is_active", true)
      .eq("companies.is_active", true),
  ]);

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
      // Count uncategorized jobs toward total but not in any group column
      entry.uncategorized++;
      continue;
    }

    const group = getCategoryGroup(job.function_category as RoleCategory);

    if (!entry.groups[group]) {
      entry.groups[group] = { current: 0, newThisWeek: 0 };
    }
    entry.groups[group].current++;

    if (
      job.first_seen_date &&
      job.first_seen_date >= oneWeekAgo &&
      !isBackfill(job.company_id, job.first_seen_date, cutoffs)
    ) {
      entry.groups[group].newThisWeek++;
    }
  }

  // Get closed this week for WoW change
  const { data: closedThisWeek } = await supabase
    .from("job_postings")
    .select("company_id, function_category")
    .gte("closed_date", oneWeekAgo);

  const closedByCompanyGroup = new Map<string, Record<string, number>>();
  let closedUncategorized = new Map<string, number>();
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

  const functionGroups = Object.keys(CATEGORY_GROUPS).filter(
    (g) => g !== "Other"
  );

  return Array.from(companyMap.entries())
    .map(([companyId, data]) => {
      const groups: Record<string, { current: number; change: number }> = {};
      let total = data.uncategorized; // Include uncategorized in total
      let weekChange = -(closedUncategorized.get(companyId) || 0);

      for (const group of functionGroups) {
        const current = data.groups[group]?.current || 0;
        const newThisWeek = data.groups[group]?.newThisWeek || 0;
        const closedThisWeekCount =
          closedByCompanyGroup.get(companyId)?.[group] || 0;
        const change = newThisWeek - closedThisWeekCount;

        groups[group] = { current, change };
        total += current;
        weekChange += change;
      }

      // Include "Other" if present
      if (data.groups["Other"]) {
        const otherNew = data.groups["Other"].newThisWeek || 0;
        const otherClosed =
          closedByCompanyGroup.get(companyId)?.["Other"] || 0;
        groups["Other"] = {
          current: data.groups["Other"].current,
          change: otherNew - otherClosed,
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
    .filter((row) => row.total > 0) // Only show companies with active jobs
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
 */
export async function getHotRoles(
  cutoffs: Map<string, Date>,
  limit: number = 15
): Promise<HotRole[]> {
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from("job_postings")
    .select(
      "id, title, company_id, first_seen_date, function_category, companies!inner(name, slug, is_active)"
    )
    .eq("is_active", true)
    .eq("companies.is_active", true)
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
 * Get net new/closed jobs this week, excluding backfill from new count.
 */
export async function getNetThisWeek(
  cutoffs: Map<string, Date>
): Promise<{ newCount: number; closedCount: number }> {
  const supabase = await createClient();
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();

  const [{ data: newJobs }, { count: closedCount }] = await Promise.all([
    supabase
      .from("job_postings")
      .select("company_id, first_seen_date")
      .gte("first_seen_date", weekStart),
    supabase
      .from("job_postings")
      .select("*", { count: "exact", head: true })
      .gte("closed_date", weekStart),
  ]);

  const filteredNew = (newJobs ?? []).filter(
    (job) => !isBackfill(job.company_id, job.first_seen_date, cutoffs)
  );

  return {
    newCount: filteredNew.length,
    closedCount: closedCount ?? 0,
  };
}
