import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTechName } from "./tech-stack-extraction";

// ============================================================================
// Exclusion list — generic productivity/office tools that add no signal
// ============================================================================

const EXCLUDED_TECH = new Set([
  "excel", "ms excel", "microsoft excel", "word", "ms word", "microsoft word",
  "powerpoint", "ms powerpoint", "microsoft powerpoint", "outlook", "ms outlook",
  "microsoft outlook", "ms office", "microsoft office", "microsoft office suite",
  "microsoft 365", "m365", "office 365", "google docs", "google sheets",
  "google slides", "sharepoint", "onedrive", "teams", "ms teams", "microsoft teams",
  "slack", "zoom", "webex", "google meet", "jira", "confluence", "trello",
  "asana", "monday.com", "notion", "miro", "figma", "canva", "adobe",
  "windows", "windows 11", "macos", "pmp", "pgmp", "lean", "agile", "scrum",
  "sdlc", "boolean search", "vlookup", "macros", "webinars", "social media",
  "google ads", "microsoft ads", "youtube", "connected tv", "display",
  "ms project", "ms visio", "access", "microsoft access", "power automate",
  "vba", "copilot", "m365 copilot", "copilot studio", "raise",
  "microsoft office 365", "microsoft 365 marketing", "microsoft dynamics 365 marketing",
  "microsoft dynamics 365 crm", "microsoft outlook", "nerdio", "intune",
  "azure virtual desktop",
]);

/** Flat technology mention with count and date range (no category). */
export interface FlatTechMention {
  name: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

/**
 * Aggregate tech stack data from the per-job `tech_stack` column.
 * Produces a flat, uncategorized list of technology mentions.
 * Categorization is deferred to the LLM enrichment step.
 *
 * This is a pure DB query + JS processing — no AI call, instant, deterministic.
 */
export async function aggregateTechStackFromJobs(
  companyId: string
): Promise<{ technologies: FlatTechMention[]; totalJobsAnalyzed: number; periodStart: string; periodEnd: string }> {
  const supabase = createAdminClient();

  const { data: jobs, error } = await supabase
    .from("job_postings")
    .select("id, tech_stack, first_seen_date, is_active")
    .eq("company_id", companyId)
    .not("tech_stack", "is", null)
    .neq("tech_stack", "[]")
    .order("first_seen_date", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch jobs for aggregation: ${error.message}`);
  }

  if (!jobs || jobs.length === 0) {
    return { technologies: [], totalJobsAnalyzed: 0, periodStart: "", periodEnd: "" };
  }

  // Aggregate tech mentions across all jobs (flat — no categorization)
  const techMap = new Map<string, { count: number; firstSeen: string; lastSeen: string }>();

  let jobsWithTech = 0;
  for (const job of jobs) {
    const stack = job.tech_stack;
    if (!Array.isArray(stack) || stack.length === 0) continue;

    jobsWithTech++;
    for (const rawTech of stack) {
      if (typeof rawTech !== "string" || !rawTech.trim()) continue;
      const name = normalizeTechName(rawTech);
      const key = name.toLowerCase();

      // Only filter out obvious noise — let LLM handle categorization
      if (EXCLUDED_TECH.has(key)) continue;

      const existing = techMap.get(key);
      if (existing) {
        existing.count++;
        if (job.first_seen_date < existing.firstSeen) existing.firstSeen = job.first_seen_date;
        if (job.first_seen_date > existing.lastSeen) existing.lastSeen = job.first_seen_date;
      } else {
        techMap.set(key, {
          count: 1,
          firstSeen: job.first_seen_date,
          lastSeen: job.first_seen_date,
        });
      }
    }
  }

  // Build flat list sorted by count descending
  const technologies: FlatTechMention[] = [];
  for (const [key, data] of techMap) {
    technologies.push({
      name: normalizeTechName(key),
      count: data.count,
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen,
    });
  }
  technologies.sort((a, b) => b.count - a.count);

  const allDates = jobs.map((j) => j.first_seen_date).sort();

  return {
    technologies,
    totalJobsAnalyzed: jobsWithTech,
    periodStart: allDates[0] ?? "",
    periodEnd: allDates[allDates.length - 1] ?? "",
  };
}
