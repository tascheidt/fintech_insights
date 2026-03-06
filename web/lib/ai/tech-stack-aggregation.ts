import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeTechName,
  CATEGORY_LABELS,
  type CompanyTechStack,
  type TechCategory,
  type TechItem,
} from "./tech-stack-extraction";

/**
 * Simple lookup to categorize common technologies.
 * Falls back to "other" for unrecognized items.
 */
const TECH_CATEGORY_MAP: Record<string, string> = {
  // Languages
  python: "languages", go: "languages", typescript: "languages", javascript: "languages",
  java: "languages", "c#": "languages", "c++": "languages", rust: "languages", ruby: "languages",
  kotlin: "languages", swift: "languages", scala: "languages", php: "languages", r: "languages",
  elixir: "languages", dart: "languages", "objective-c": "languages", perl: "languages",
  // Frameworks
  react: "frameworks", "next.js": "frameworks", "vue.js": "frameworks", angular: "frameworks",
  django: "frameworks", flask: "frameworks", "ruby on rails": "frameworks", spring: "frameworks",
  "express.js": "frameworks", fastapi: "frameworks", "nuxt.js": "frameworks", svelte: "frameworks",
  ".net": "frameworks", laravel: "frameworks", "node.js": "frameworks", rails: "frameworks",
  // Databases
  postgresql: "databases", mysql: "databases", mongodb: "databases", redis: "databases",
  dynamodb: "databases", elasticsearch: "databases", cassandra: "databases", sqlite: "databases",
  "sql server": "databases", oracle: "databases", neo4j: "databases", cockroachdb: "databases",
  // Cloud
  aws: "cloud", gcp: "cloud", azure: "cloud", terraform: "cloud", cloudflare: "cloud",
  heroku: "cloud", vercel: "cloud", digitalocean: "cloud",
  // DevOps
  docker: "devops", kubernetes: "devops", "ci/cd": "devops", jenkins: "devops",
  "github actions": "devops", gitlab: "devops", ansible: "devops", datadog: "devops",
  grafana: "devops", prometheus: "devops", newrelic: "devops",
  // Data
  spark: "data_tools", snowflake: "data_tools", kafka: "data_tools", airflow: "data_tools",
  dbt: "data_tools", bigquery: "data_tools", redshift: "data_tools", tableau: "data_tools",
  looker: "data_tools", fivetran: "data_tools",
  // AI/ML
  pytorch: "ai_ml", tensorflow: "ai_ml", "machine learning": "ai_ml", "deep learning": "ai_ml",
  llm: "ai_ml", genai: "ai_ml", langchain: "ai_ml", openai: "ai_ml", huggingface: "ai_ml",
  scikit: "ai_ml",
};

function categorizeTech(name: string): string {
  const lower = name.toLowerCase();
  return TECH_CATEGORY_MAP[lower] ?? "other";
}

/**
 * Aggregate tech stack data from the per-job `tech_stack` column.
 * This is a pure DB query + JS processing — no AI call, instant, deterministic.
 */
export async function aggregateTechStackFromJobs(
  companyId: string
): Promise<CompanyTechStack> {
  const supabase = createAdminClient();

  // Get all jobs for this company with tech_stack data
  const { data: jobs, error } = await supabase
    .from("job_postings")
    .select("id, tech_stack, first_seen_date, is_active")
    .eq("company_id", companyId)
    .not("tech_stack", "is", null)
    .order("first_seen_date", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch jobs for aggregation: ${error.message}`);
  }

  if (!jobs || jobs.length === 0) {
    return {
      categories: [],
      totalJobsAnalyzed: 0,
      generatedAt: new Date().toISOString(),
      periodStart: "",
      periodEnd: "",
    };
  }

  // Aggregate tech mentions across all jobs
  const techMap = new Map<string, { count: number; firstSeen: string; lastSeen: string; category: string }>();

  let jobsWithTech = 0;
  for (const job of jobs) {
    const stack = job.tech_stack;
    if (!Array.isArray(stack) || stack.length === 0) continue;

    jobsWithTech++;
    for (const rawTech of stack) {
      if (typeof rawTech !== "string" || !rawTech.trim()) continue;
      const name = normalizeTechName(rawTech);
      const key = name.toLowerCase();

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
          category: categorizeTech(name),
        });
      }
    }
  }

  // Group by category
  const categoryMap = new Map<string, TechItem[]>();
  for (const [key, data] of techMap) {
    const name = normalizeTechName(key);
    const items = categoryMap.get(data.category) ?? [];
    items.push({
      name,
      count: data.count,
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen,
    });
    categoryMap.set(data.category, items);
  }

  // Build categories array
  const categories: TechCategory[] = [];
  for (const [categoryKey, technologies] of categoryMap) {
    technologies.sort((a, b) => b.count - a.count);
    categories.push({
      category: categoryKey,
      label: CATEGORY_LABELS[categoryKey] ?? categoryKey,
      technologies,
    });
  }

  // Sort categories by total mentions
  categories.sort(
    (a, b) =>
      b.technologies.reduce((s, t) => s + t.count, 0) -
      a.technologies.reduce((s, t) => s + t.count, 0)
  );

  // Period bounds
  const allDates = jobs.map((j) => j.first_seen_date).sort();

  return {
    categories,
    totalJobsAnalyzed: jobsWithTech,
    generatedAt: new Date().toISOString(),
    periodStart: allDates[0] ?? "",
    periodEnd: allDates[allDates.length - 1] ?? "",
  };
}
