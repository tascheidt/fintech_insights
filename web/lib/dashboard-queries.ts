import { createClient } from "@/lib/supabase/server";
import { getCategoryGroup, RoleCategory } from "@/lib/analysis/function-categories";
import { startOfWeek, format, subDays, parseISO, startOfMonth } from "date-fns";

export interface WeeklyTrend {
  date: string; // ISO date string for start of week
  label: string; // Formatted label (e.g., "Jan 24")
  count: number;
}

export interface FunctionTrend {
  period: string; // Label for the period (e.g., "Jan 2024" or "Wk 1")
  date: string; // ISO date for sorting
  [key: string]: string | number; // Dynamic keys for category groups
}

export interface RawFunctionData {
  company_id: string;
  function_category: string;
  first_seen_date: string;
}

/**
 * Get job posting volume trends grouped by week for the last X days
 */
export async function getPostingTrends(days: number = 90): Promise<WeeklyTrend[]> {
  const supabase = await createClient();
  const startDate = subDays(new Date(), days).toISOString();

  const { data: jobs, error } = await supabase
    .from("job_postings")
    .select("first_seen_date")
    .gte("first_seen_date", startDate)
    .order("first_seen_date", { ascending: true });

  if (error) {
    console.error("Error fetching posting trends:", error);
    return [];
  }

  // Group by week
  const weeklyMap = new Map<string, number>();
  
  jobs.forEach((job) => {
    if (!job.first_seen_date) return;
    const date = parseISO(job.first_seen_date);
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const key = weekStart.toISOString();
    
    weeklyMap.set(key, (weeklyMap.get(key) || 0) + 1);
  });

  // Convert to array and sort
  return Array.from(weeklyMap.entries())
    .map(([date, count]) => ({
      date,
      label: format(parseISO(date), "MMM d"),
      count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get raw function category data for client-side filtering
 */
export async function getRawFunctionData(days: number = 90): Promise<RawFunctionData[]> {
  const supabase = await createClient();
  const startDate = subDays(new Date(), days).toISOString();

  const { data: jobs, error } = await supabase
    .from("job_postings")
    .select("company_id, function_category, first_seen_date")
    .gte("first_seen_date", startDate)
    .not("function_category", "is", null)
    .not("first_seen_date", "is", null);

  if (error) {
    console.error("Error fetching raw function data:", error);
    return [];
  }

  return jobs as RawFunctionData[];
}

/**
 * Get function category trends grouped by month for the last X days
 */
export async function getFunctionTrends(days: number = 90): Promise<FunctionTrend[]> {
  const supabase = await createClient();
  const startDate = subDays(new Date(), days).toISOString();

  const { data: jobs, error } = await supabase
    .from("job_postings")
    .select("first_seen_date, function_category")
    .gte("first_seen_date", startDate)
    .not("function_category", "is", null);

  if (error) {
    console.error("Error fetching function trends:", error);
    return [];
  }

  // Group by month and category group
  const periodMap = new Map<string, Record<string, number>>();
  
  jobs.forEach((job) => {
    if (!job.first_seen_date || !job.function_category) return;
    
    const date = parseISO(job.first_seen_date);
    // Group by month for cleaner high-level trends
    const periodStart = startOfMonth(date); 
    const periodKey = periodStart.toISOString();
    
    const group = getCategoryGroup(job.function_category as RoleCategory);
    
    if (!periodMap.has(periodKey)) {
      periodMap.set(periodKey, {});
    }
    
    const periodCounts = periodMap.get(periodKey)!;
    periodCounts[group] = (periodCounts[group] || 0) + 1;
  });

  // Convert to array suitable for Recharts
  return Array.from(periodMap.entries())
    .map(([date, counts]) => ({
      date,
      period: format(parseISO(date), "MMM yyyy"),
      ...counts,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
