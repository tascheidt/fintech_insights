import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeTechName,
  CATEGORY_LABELS,
  type CompanyTechStack,
  type TechCategory,
  type TechItem,
} from "./tech-stack-extraction";

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

// ============================================================================
// Three-perspective category map
// ============================================================================

const TECH_CATEGORY_MAP: Record<string, string> = {
  // === BANKING & FINANCIAL PLATFORMS ===
  // Core banking
  "temenos": "banking_platforms", "temenos t24": "banking_platforms", "temenos connect": "banking_platforms",
  "fis": "banking_platforms", "finastra": "banking_platforms", "fiserv": "banking_platforms",
  "jack henry": "banking_platforms", "mambu": "banking_platforms", "thought machine": "banking_platforms",
  "core banking platforms": "banking_platforms", "banking systems": "banking_platforms",
  // Payments & fintech platforms
  "stripe": "banking_platforms", "plaid": "banking_platforms", "marqeta": "banking_platforms",
  "galileo": "banking_platforms", "i2c": "banking_platforms", "tabapay": "banking_platforms",
  // Lending & credit
  "credit management systems": "banking_platforms", "loan management systems": "banking_platforms",
  "mortgage securitization software": "banking_platforms", "underwriting software": "banking_platforms",
  "mortgage data validation platform": "banking_platforms",
  // Risk & compliance platforms
  "transunion": "banking_platforms", "equifax": "banking_platforms", "experian": "banking_platforms",
  "fico": "banking_platforms", "sas": "banking_platforms",
  "grc tools": "banking_platforms", "kyc": "banking_platforms", "aml": "banking_platforms",
  // CRM / financial ops
  "salesforce": "banking_platforms", "dynamics": "banking_platforms",
  "microsoft dynamics": "banking_platforms", "microsoft foundry": "banking_platforms",
  "servicenow": "banking_platforms", "pega": "banking_platforms",
  // Front-end / digital banking
  "mobile ecosystem": "banking_platforms", "digital platforms": "banking_platforms",
  "react native": "banking_platforms",

  // === SOFTWARE DEVELOPMENT STACK ===
  // Languages
  "python": "dev_stack", "go": "dev_stack", "typescript": "dev_stack", "javascript": "dev_stack",
  "java": "dev_stack", "c#": "dev_stack", "c++": "dev_stack", "rust": "dev_stack",
  "ruby": "dev_stack", "kotlin": "dev_stack", "swift": "dev_stack", "scala": "dev_stack",
  "php": "dev_stack", "r": "dev_stack", "elixir": "dev_stack", "dart": "dev_stack",
  "objective-c": "dev_stack", "perl": "dev_stack", "swiftui": "dev_stack", "flutter": "dev_stack",
  // Frameworks
  "react": "dev_stack", "next.js": "dev_stack", "vue.js": "dev_stack", "angular": "dev_stack",
  "django": "dev_stack", "flask": "dev_stack", "ruby on rails": "dev_stack", "spring": "dev_stack",
  "spring boot": "dev_stack", "spring mvc": "dev_stack", "spring security": "dev_stack",
  "express.js": "dev_stack", "fastapi": "dev_stack", ".net": "dev_stack", "node.js": "dev_stack",
  "hibernate": "dev_stack", "graphql": "dev_stack", "rest": "dev_stack", "restful apis": "dev_stack",
  "microservices": "dev_stack", "rxjava": "dev_stack", "rxswift": "dev_stack",
  "coroutines": "dev_stack", "swift concurrency": "dev_stack",
  // Databases
  "postgresql": "dev_stack", "mysql": "dev_stack", "mongodb": "dev_stack", "redis": "dev_stack",
  "dynamodb": "dev_stack", "elasticsearch": "dev_stack", "cassandra": "dev_stack",
  "sql server": "dev_stack", "sql": "dev_stack", "mssql": "dev_stack", "azure sql": "dev_stack",
  "oracle": "dev_stack", "neo4j": "dev_stack", "cockroachdb": "dev_stack", "cosmos db": "dev_stack",
  // Cloud & infra
  "aws": "dev_stack", "gcp": "dev_stack", "azure": "dev_stack", "terraform": "dev_stack",
  "cloudflare": "dev_stack", "vercel": "dev_stack",
  // DevOps & tooling
  "docker": "dev_stack", "kubernetes": "dev_stack", "ci/cd": "dev_stack", "jenkins": "dev_stack",
  "github actions": "dev_stack", "github": "dev_stack", "gitlab": "dev_stack", "git": "dev_stack",
  "ansible": "dev_stack", "datadog": "dev_stack", "grafana": "dev_stack",
  "prometheus": "dev_stack", "newrelic": "dev_stack", "splunk": "dev_stack",
  "containers": "dev_stack", "kafka": "dev_stack", "rabbitmq": "dev_stack",
  "postman": "dev_stack", "selenium webdriver": "dev_stack", "cucumber": "dev_stack",
  "appium": "dev_stack", "junit": "dev_stack", "testng": "dev_stack",
  "azure devops": "dev_stack", "soap": "dev_stack", "xml": "dev_stack", "json": "dev_stack",
  "blob storage": "dev_stack", "azure files": "dev_stack", "cdn": "dev_stack",
  "api protection": "dev_stack",

  // === DATA & ANALYTICS ===
  "spark": "data_analytics", "snowflake": "data_analytics", "airflow": "data_analytics",
  "dbt": "data_analytics", "bigquery": "data_analytics", "redshift": "data_analytics",
  "tableau": "data_analytics", "looker": "data_analytics", "fivetran": "data_analytics",
  "power bi": "data_analytics", "powerbi": "data_analytics",
  "databricks": "data_analytics", "data pipelines": "data_analytics", "etl": "data_analytics",
  "data analytics": "data_analytics", "digital reporting tools": "data_analytics",
  "google analytics": "data_analytics", "microsoft fabric": "data_analytics",
  "crystalline": "data_analytics", "dataverse": "data_analytics",
  "anaplan": "data_analytics", "apache atlas": "data_analytics",
  // AI/ML
  "pytorch": "data_analytics", "tensorflow": "data_analytics",
  "machine learning": "data_analytics", "deep learning": "data_analytics",
  "llm": "data_analytics", "genai": "data_analytics", "langchain": "data_analytics",
  "openai": "data_analytics", "huggingface": "data_analytics", "scikit": "data_analytics",
  "ai tools": "data_analytics", "ai-powered forecasting tools": "data_analytics",
  "marketing mix model": "data_analytics",
};

function categorizeTech(name: string): string {
  const lower = name.toLowerCase();
  if (EXCLUDED_TECH.has(lower)) return "__excluded__";
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

  // Get all jobs for this company with non-empty tech_stack data
  // tech_stack column defaults to '[]' (empty JSONB array), so we must exclude both NULL and '[]'
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
      const category = categorizeTech(name);
      if (category === "__excluded__") continue;

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
