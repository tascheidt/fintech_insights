/**
 * Context Builder for Advanced Strategic Analysis
 * Builds historical context and pattern detection for company hiring trends
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface HistoricalContext {
  summary: string;
  hiringTrends: HiringTrend[];
  recentExecutiveHires: ExecutiveHire[];
  departmentBreakdown: DepartmentStats[];
  totalJobsInPeriod: number;
}

export interface HiringTrend {
  standardized_department: string | null;
  trend: "increasing" | "decreasing" | "stable" | "new";
  jobCount: number;
  description: string;
}

export interface ExecutiveHire {
  title: string;
  standardized_department: string | null;
  firstSeenDate: string;
  description: string;
}

export interface DepartmentStats {
  standardized_department: string | null;
  count: number;
  percentage: number;
}

/**
 * Build historical context for a company's hiring patterns
 */
export async function buildHistoricalContext(
  companyId: string,
  days: number = 90
): Promise<HistoricalContext> {
  const supabase = createAdminClient();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Fetch all active jobs from the period
  const { data: jobs } = await supabase
    .from("job_postings")
    .select("id, title, standardized_department, first_seen_date, is_active")
    .eq("company_id", companyId)
    .gte("first_seen_date", cutoffDate.toISOString())
    .order("first_seen_date", { ascending: false });

  if (!jobs || jobs.length === 0) {
    return {
      summary: "No historical hiring data available for the past " + days + " days.",
      hiringTrends: [],
      recentExecutiveHires: [],
      departmentBreakdown: [],
      totalJobsInPeriod: 0,
    };
  }

  const trends = detectHiringTrends(jobs, days);
  const executives = getRecentExecutiveHires(jobs);
  const departments = getDepartmentBreakdown(jobs);

  // Build summary text
  const summary = buildSummaryText(jobs.length, trends, executives, departments, days);

  return {
    summary,
    hiringTrends: trends,
    recentExecutiveHires: executives,
    departmentBreakdown: departments,
    totalJobsInPeriod: jobs.length,
  };
}

/**
 * Detect hiring trends by department
 */
export function detectHiringTrends(
  jobs: Array<{ standardized_department: string | null; first_seen_date: string }>,
  days: number
): HiringTrend[] {
  const now = new Date();
  const midPoint = new Date(now.getTime() - (days / 2) * 24 * 60 * 60 * 1000);

  // Group by department
  const byDept = new Map<string | null, Array<{ first_seen_date: string }>>();
  for (const job of jobs) {
    const dept = job.standardized_department || "Unspecified";
    if (!byDept.has(dept)) {
      byDept.set(dept, []);
    }
    byDept.get(dept)!.push({ first_seen_date: job.first_seen_date });
  }

  const trends: HiringTrend[] = [];

  for (const [dept, deptJobs] of byDept.entries()) {
    const recent = deptJobs.filter(
      (j) => new Date(j.first_seen_date) >= midPoint
    ).length;
    const earlier = deptJobs.length - recent;

    let trend: HiringTrend["trend"];
    let description: string;

    if (deptJobs.length < 3) {
      trend = "new";
      description = `New department with ${deptJobs.length} recent posting(s)`;
    } else if (recent > earlier * 1.5) {
      trend = "increasing";
      description = `Growing: ${recent} postings in last ${Math.floor(days / 2)} days vs ${earlier} earlier`;
    } else if (recent < earlier * 0.5) {
      trend = "decreasing";
      description = `Declining: ${recent} postings in last ${Math.floor(days / 2)} days vs ${earlier} earlier`;
    } else {
      trend = "stable";
      description = `Stable: ${deptJobs.length} total postings, ${recent} recent`;
    }

    trends.push({
      standardized_department: dept === "Unspecified" ? null : dept,
      trend,
      jobCount: deptJobs.length,
      description,
    });
  }

  return trends.sort((a, b) => b.jobCount - a.jobCount);
}

/**
 * Extract recent executive/leadership hires
 */
export function getRecentExecutiveHires(
  jobs: Array<{ title: string; standardized_department: string | null; first_seen_date: string }>
): ExecutiveHire[] {
  const executiveKeywords = [
    "chief",
    "cto",
    "cfo",
    "ceo",
    "president",
    "vp ",
    "vice president",
    "director",
    "head of",
    "lead",
    "principal",
    "senior director",
    "executive",
  ];

  const executives: ExecutiveHire[] = [];

  for (const job of jobs) {
    const titleLower = job.title.toLowerCase();
    const isExecutive = executiveKeywords.some((keyword) =>
      titleLower.includes(keyword)
    );

    if (isExecutive) {
      executives.push({
        title: job.title,
        standardized_department: job.standardized_department,
        firstSeenDate: job.first_seen_date,
        description: `${job.title}${job.standardized_department ? ` in ${job.standardized_department}` : ""}`,
      });
    }
  }

  // Sort by date, most recent first
  return executives.sort(
    (a, b) =>
      new Date(b.firstSeenDate).getTime() - new Date(a.firstSeenDate).getTime()
  );
}

/**
 * Get department breakdown statistics
 */
export function getDepartmentBreakdown(
  jobs: Array<{ standardized_department: string | null }>
): DepartmentStats[] {
  const counts = new Map<string | null, number>();
  const total = jobs.length;

  for (const job of jobs) {
    const dept = job.standardized_department || null;
    counts.set(dept, (counts.get(dept) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([dept, count]) => ({
      standardized_department: dept,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Build a human-readable summary text
 */
function buildSummaryText(
  totalJobs: number,
  trends: HiringTrend[],
  executives: ExecutiveHire[],
  departments: DepartmentStats[],
  days: number
): string {
  const parts: string[] = [];

  parts.push(
    `Over the past ${days} days, ${totalJobs} job posting(s) have been tracked.`
  );

  if (departments.length > 0) {
    const topDepts = departments.slice(0, 3);
    parts.push(
      `Top departments: ${topDepts.map((d) => `${d.standardized_department || "Unspecified"} (${d.count})`).join(", ")}.`
    );
  }

  const increasing = trends.filter((t) => t.trend === "increasing");
  if (increasing.length > 0) {
    parts.push(
      `Growing areas: ${increasing.map((t) => t.standardized_department || "Unspecified").join(", ")}.`
    );
  }

  if (executives.length > 0) {
    parts.push(
      `Recent executive/leadership hires: ${executives.slice(0, 5).map((e) => e.title).join(", ")}.`
    );
  }

  return parts.join(" ");
}

/**
 * Format historical context for LLM prompt
 */
export function formatHistoricalContextForPrompt(context: HistoricalContext): string {
  let text = `## Company Hiring History (Past 90 Days)\n\n`;
  text += `${context.summary}\n\n`;

  if (context.hiringTrends.length > 0) {
    text += `### Hiring Trends by Department:\n`;
    for (const trend of context.hiringTrends.slice(0, 10)) {
      text += `- ${trend.standardized_department || "Unspecified"}: ${trend.description}\n`;
    }
    text += `\n`;
  }

  if (context.recentExecutiveHires.length > 0) {
    text += `### Recent Executive/Leadership Hires:\n`;
    for (const exec of context.recentExecutiveHires.slice(0, 10)) {
      text += `- ${exec.description} (posted ${new Date(exec.firstSeenDate).toLocaleDateString()})\n`;
    }
    text += `\n`;
  }

  return text;
}

// ============================================================================
// Extended Context for Company-Level Insights
// ============================================================================

import {
  type FunctionStats,
  type GroupStats,
  type RoleCategory,
  categorizeJobs,
  getGroupStats,
  getCategoryLabel,
} from "./function-categories";

export { type FunctionStats, type GroupStats, type RoleCategory };

export interface FunctionTrend {
  category: RoleCategory;
  label: string;
  group: string;
  trend: "increasing" | "decreasing" | "stable" | "new";
  currentCount: number;
  previousCount: number;
  description: string;
}

export interface ExtendedHistoricalContext extends HistoricalContext {
  functionBreakdown: FunctionStats[];
  groupBreakdown: GroupStats[];
  functionTrends: FunctionTrend[];
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Build extended historical context with function categorization
 * This is used for company-level strategic insights.
 */
export async function buildExtendedHistoricalContext(
  companyId: string,
  days: number = 90
): Promise<ExtendedHistoricalContext> {
  const supabase = createAdminClient();
  const now = new Date();
  const periodEnd = now;
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - days);

  // Also calculate previous period for trend comparison
  const previousPeriodStart = new Date(periodStart);
  previousPeriodStart.setDate(previousPeriodStart.getDate() - days);

  // Fetch current period jobs
  const { data: currentJobs } = await supabase
    .from("job_postings")
    .select("id, title, standardized_department, first_seen_date, is_active")
    .eq("company_id", companyId)
    .gte("first_seen_date", periodStart.toISOString())
    .order("first_seen_date", { ascending: false });

  // Fetch previous period jobs for trend comparison
  const { data: previousJobs } = await supabase
    .from("job_postings")
    .select("id, title, standardized_department, first_seen_date, is_active")
    .eq("company_id", companyId)
    .gte("first_seen_date", previousPeriodStart.toISOString())
    .lt("first_seen_date", periodStart.toISOString())
    .order("first_seen_date", { ascending: false });

  const jobs = currentJobs || [];
  const prevJobs = previousJobs || [];

  if (jobs.length === 0) {
    return {
      summary: `No historical hiring data available for the past ${days} days.`,
      hiringTrends: [],
      recentExecutiveHires: [],
      departmentBreakdown: [],
      totalJobsInPeriod: 0,
      functionBreakdown: [],
      groupBreakdown: [],
      functionTrends: [],
      periodStart,
      periodEnd,
    };
  }

  // Build base context using existing functions
  const trends = detectHiringTrends(jobs, days);
  const executives = getRecentExecutiveHires(jobs);
  const departments = getDepartmentBreakdown(jobs);

  // Add function categorization
  const functionBreakdown = categorizeJobs(jobs);
  const groupBreakdown = getGroupStats(functionBreakdown);

  // Calculate function trends vs previous period
  const previousFunctionBreakdown = categorizeJobs(prevJobs);
  const functionTrends = calculateFunctionTrends(functionBreakdown, previousFunctionBreakdown, days);

  // Build enhanced summary
  const summary = buildExtendedSummaryText(jobs.length, trends, executives, departments, functionBreakdown, days);

  return {
    summary,
    hiringTrends: trends,
    recentExecutiveHires: executives,
    departmentBreakdown: departments,
    totalJobsInPeriod: jobs.length,
    functionBreakdown,
    groupBreakdown,
    functionTrends,
    periodStart,
    periodEnd,
  };
}

/**
 * Calculate function trends by comparing current vs previous period
 */
function calculateFunctionTrends(
  current: FunctionStats[],
  previous: FunctionStats[],
  days: number
): FunctionTrend[] {
  const previousMap = new Map(previous.map((f) => [f.category, f.count]));
  const trends: FunctionTrend[] = [];

  for (const func of current) {
    const prevCount = previousMap.get(func.category) || 0;
    const currentCount = func.count;

    let trend: FunctionTrend["trend"];
    let description: string;

    if (prevCount === 0 && currentCount > 0) {
      trend = "new";
      description = `New function with ${currentCount} posting(s)`;
    } else if (currentCount > prevCount * 1.5) {
      trend = "increasing";
      description = `Growing: ${currentCount} vs ${prevCount} in previous ${days} days (+${Math.round(((currentCount - prevCount) / Math.max(prevCount, 1)) * 100)}%)`;
    } else if (currentCount < prevCount * 0.5) {
      trend = "decreasing";
      description = `Declining: ${currentCount} vs ${prevCount} in previous ${days} days (${Math.round(((currentCount - prevCount) / Math.max(prevCount, 1)) * 100)}%)`;
    } else {
      trend = "stable";
      description = `Stable: ${currentCount} postings (was ${prevCount})`;
    }

    trends.push({
      category: func.category,
      label: func.label,
      group: func.group,
      trend,
      currentCount,
      previousCount: prevCount,
      description,
    });
  }

  // Also check for functions that existed in previous but not in current (declining to zero)
  for (const prev of previous) {
    if (!current.find((c) => c.category === prev.category)) {
      trends.push({
        category: prev.category,
        label: getCategoryLabel(prev.category),
        group: prev.group,
        trend: "decreasing",
        currentCount: 0,
        previousCount: prev.count,
        description: `Eliminated: was ${prev.count} posting(s), now 0`,
      });
    }
  }

  return trends.sort((a, b) => b.currentCount - a.currentCount);
}

/**
 * Build extended summary text including function analysis
 */
function buildExtendedSummaryText(
  totalJobs: number,
  trends: HiringTrend[],
  executives: ExecutiveHire[],
  departments: DepartmentStats[],
  functions: FunctionStats[],
  days: number
): string {
  const parts: string[] = [];

  parts.push(`Over the past ${days} days, ${totalJobs} job posting(s) have been tracked.`);

  // Top functions by category
  if (functions.length > 0) {
    const topFunctions = functions.slice(0, 3);
    parts.push(
      `Top functions: ${topFunctions.map((f) => `${f.label} (${f.count}, ${f.percentage}%)`).join(", ")}.`
    );
  }

  // Department info
  if (departments.length > 0) {
    const topDepts = departments.slice(0, 3);
    parts.push(
      `Top departments: ${topDepts.map((d) => `${d.standardized_department || "Unspecified"} (${d.count})`).join(", ")}.`
    );
  }

  // Growing areas
  const increasing = trends.filter((t) => t.trend === "increasing");
  if (increasing.length > 0) {
    parts.push(`Growing areas: ${increasing.map((t) => t.standardized_department || "Unspecified").join(", ")}.`);
  }

  // Executives
  if (executives.length > 0) {
    parts.push(
      `Recent executive/leadership hires: ${executives.slice(0, 5).map((e) => e.title).join(", ")}.`
    );
  }

  return parts.join(" ");
}

/**
 * Format extended context for company insight LLM prompt
 */
export function formatExtendedContextForPrompt(context: ExtendedHistoricalContext): string {
  let text = `## Company Hiring Analysis (${context.periodStart.toLocaleDateString()} - ${context.periodEnd.toLocaleDateString()})\n\n`;
  text += `${context.summary}\n\n`;

  // Function breakdown by group
  if (context.groupBreakdown.length > 0) {
    text += `### Hiring by Function Group:\n`;
    for (const group of context.groupBreakdown) {
      text += `- **${group.group}**: ${group.count} postings (${group.percentage}%)\n`;
      for (const cat of group.categories.slice(0, 3)) {
        text += `  - ${cat.label}: ${cat.count}\n`;
      }
    }
    text += `\n`;
  }

  // Function trends
  const significantTrends = context.functionTrends.filter(
    (t) => t.trend === "increasing" || t.trend === "new" || t.trend === "decreasing"
  );
  if (significantTrends.length > 0) {
    text += `### Significant Hiring Trends:\n`;
    for (const trend of significantTrends.slice(0, 10)) {
      const emoji = trend.trend === "increasing" ? "📈" : trend.trend === "new" ? "🆕" : "📉";
      text += `- ${emoji} ${trend.label}: ${trend.description}\n`;
    }
    text += `\n`;
  }

  // Executive hires
  if (context.recentExecutiveHires.length > 0) {
    text += `### Recent Executive/Leadership Hires:\n`;
    for (const exec of context.recentExecutiveHires.slice(0, 10)) {
      text += `- ${exec.description} (posted ${new Date(exec.firstSeenDate).toLocaleDateString()})\n`;
    }
    text += `\n`;
  }

  return text;
}
