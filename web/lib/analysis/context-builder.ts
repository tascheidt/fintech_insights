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
  department: string | null;
  trend: "increasing" | "decreasing" | "stable" | "new";
  jobCount: number;
  description: string;
}

export interface ExecutiveHire {
  title: string;
  department: string | null;
  firstSeenDate: string;
  description: string;
}

export interface DepartmentStats {
  department: string | null;
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
    .select("id, title, department, first_seen_date, is_active")
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
  jobs: Array<{ department: string | null; first_seen_date: string }>,
  days: number
): HiringTrend[] {
  const now = new Date();
  const midPoint = new Date(now.getTime() - (days / 2) * 24 * 60 * 60 * 1000);

  // Group by department
  const byDept = new Map<string | null, Array<{ first_seen_date: string }>>();
  for (const job of jobs) {
    const dept = job.department || "Unspecified";
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
      department: dept === "Unspecified" ? null : dept,
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
  jobs: Array<{ title: string; department: string | null; first_seen_date: string }>
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
        department: job.department,
        firstSeenDate: job.first_seen_date,
        description: `${job.title}${job.department ? ` in ${job.department}` : ""}`,
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
  jobs: Array<{ department: string | null }>
): DepartmentStats[] {
  const counts = new Map<string | null, number>();
  const total = jobs.length;

  for (const job of jobs) {
    const dept = job.department || null;
    counts.set(dept, (counts.get(dept) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([dept, count]) => ({
      department: dept,
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
      `Top departments: ${topDepts.map((d) => `${d.department || "Unspecified"} (${d.count})`).join(", ")}.`
    );
  }

  const increasing = trends.filter((t) => t.trend === "increasing");
  if (increasing.length > 0) {
    parts.push(
      `Growing areas: ${increasing.map((t) => t.department || "Unspecified").join(", ")}.`
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
      text += `- ${trend.department || "Unspecified"}: ${trend.description}\n`;
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
