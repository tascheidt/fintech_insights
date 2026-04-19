import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  DEFAULT_TECH_STACK_AI_CONFIG,
  type TechStackAiConfig,
} from "./prompt-config";

/**
 * Tech Stack Extraction
 *
 * Extracts structured technology keywords from job descriptions using Gemini,
 * then aggregates them into a cumulative tech stack profile for each company.
 */

// ============================================================================
// Types
// ============================================================================

export interface TechCategory {
  category: string;
  label: string;
  technologies: TechItem[];
  narrativeSummary?: string;
}

export interface TechItem {
  name: string;
  /** Number of job postings mentioning this technology */
  count: number;
  /** When this tech was last seen in a job posting */
  lastSeen: string;
  /** When this tech was first seen in a job posting */
  firstSeen: string;
}

export interface CompanyTechStack {
  categories: TechCategory[];
  totalJobsAnalyzed: number;
  generatedAt: string;
  /** Oldest job posting considered */
  periodStart: string;
  /** Most recent job posting considered */
  periodEnd: string;
  /** AI-generated architect-level summary of the tech stack */
  architectSummary?: string;
}

const GEMINI_REQUEST_TIMEOUT_MS = 30000;

/** Raw extraction result from a batch of job descriptions */
interface JobTechExtraction {
  languages: Record<string, number>;
  frameworks: Record<string, number>;
  databases: Record<string, number>;
  cloud: Record<string, number>;
  devops: Record<string, number>;
  data_tools: Record<string, number>;
  ai_ml: Record<string, number>;
  other: Record<string, number>;
}

// ============================================================================
// Normalization Map
// ============================================================================

const NORMALIZATION_MAP: Record<string, string> = {
  // Languages
  "react.js": "React",
  reactjs: "React",
  "node.js": "Node.js",
  nodejs: "Node.js",
  golang: "Go",
  "go lang": "Go",
  "c#": "C#",
  "c sharp": "C#",
  csharp: "C#",
  "objective-c": "Objective-C",
  objc: "Objective-C",
  "type script": "TypeScript",
  ts: "TypeScript",
  js: "JavaScript",
  "python3": "Python",
  "python 3": "Python",
  py: "Python",
  rb: "Ruby",
  "ruby on rails": "Ruby on Rails",
  ror: "Ruby on Rails",
  "vue.js": "Vue.js",
  vuejs: "Vue.js",
  "next.js": "Next.js",
  nextjs: "Next.js",
  "nuxt.js": "Nuxt.js",
  nuxtjs: "Nuxt.js",
  "express.js": "Express.js",
  expressjs: "Express.js",
  // Cloud
  aws: "AWS",
  "amazon web services": "AWS",
  gcp: "GCP",
  "google cloud": "GCP",
  "google cloud platform": "GCP",
  azure: "Azure",
  "microsoft azure": "Azure",
  // Databases
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  mongo: "MongoDB",
  mongodb: "MongoDB",
  dynamodb: "DynamoDB",
  "dynamo db": "DynamoDB",
  mysql: "MySQL",
  redis: "Redis",
  // DevOps
  k8s: "Kubernetes",
  kube: "Kubernetes",
  ci: "CI/CD",
  cd: "CI/CD",
  "ci/cd": "CI/CD",
  // AI/ML
  "machine learning": "Machine Learning",
  ml: "Machine Learning",
  "deep learning": "Deep Learning",
  dl: "Deep Learning",
  llm: "LLM",
  "large language model": "LLM",
  "large language models": "LLM",
  genai: "GenAI",
  "generative ai": "GenAI",
};

const CATEGORY_LABELS: Record<string, string> = {
  banking_platforms: "Banking & Financial Platforms",
  dev_stack: "Software Development Stack",
  data_analytics: "Data & Analytics",
  other: "Other",
  // Legacy categories (for backward compat with older data)
  languages: "Languages",
  frameworks: "Frameworks & Libraries",
  databases: "Databases & Storage",
  cloud: "Cloud & Infrastructure",
  devops: "DevOps & CI/CD",
  data_tools: "Data & Analytics",
  ai_ml: "AI & Machine Learning",
};

// ============================================================================
// Prompt
// ============================================================================

const EXTRACTION_PROMPT = `You are a technical recruiter analyst specializing in fintech. Extract specific technologies, tools, and platforms mentioned in the following job descriptions.

RULES:
- Only extract explicitly named technologies (e.g., "Python", "AWS", "React")
- Do NOT extract generic skills (e.g., "Excel", "Email", "Word", "PowerPoint", "communication")
- Do NOT extract methodologies (e.g., "Agile", "Scrum") unless they are tools (e.g., "Jira")
- Do NOT extract vague terms (e.g., "cloud", "database", "API") — only named products/languages
- Normalize common abbreviations (e.g., "k8s" → "Kubernetes", "postgres" → "PostgreSQL")
- Include version-agnostic names (e.g., "Java" not "Java 17")

JOB DESCRIPTIONS:
{job_data}

Respond with a JSON object categorizing each technology found, with the value being the number of job descriptions that mention it:
{
  "languages": {"Python": 5, "Go": 3, "TypeScript": 2},
  "frameworks": {"React": 4, "Django": 2},
  "databases": {"PostgreSQL": 6, "Redis": 3},
  "cloud": {"AWS": 7, "Terraform": 2},
  "devops": {"Docker": 4, "Kubernetes": 3},
  "data_tools": {"Spark": 2, "Snowflake": 1},
  "ai_ml": {"PyTorch": 1},
  "other": {"Kafka": 3, "GraphQL": 2}
}

Only include categories that have entries. Return an empty object {} if no technologies are found.`;

// ============================================================================
// Helpers
// ============================================================================

function normalizeTechName(name: string): string {
  const lower = name.toLowerCase().trim();
  return NORMALIZATION_MAP[lower] ?? name.trim();
}

/**
 * Merge extracted technologies into an aggregated tech stack.
 * Each call represents one batch of jobs analyzed together.
 * The extraction contains per-tech mention counts from the model.
 */
function mergeIntoStack(
  existing: CompanyTechStack,
  extraction: JobTechExtraction,
  earliestDate: string,
  latestDate: string
): void {
  for (const [categoryKey, techCounts] of Object.entries(extraction)) {
    if (!techCounts || typeof techCounts !== "object" || Object.keys(techCounts).length === 0) continue;

    let category = existing.categories.find((c) => c.category === categoryKey);
    if (!category) {
      category = {
        category: categoryKey,
        label: CATEGORY_LABELS[categoryKey] ?? categoryKey,
        technologies: [],
      };
      existing.categories.push(category);
    }

    for (const [rawName, count] of Object.entries(techCounts)) {
      const name = normalizeTechName(rawName);
      if (!name) continue;
      const mentionCount = typeof count === "number" ? count : 1;

      const item = category.technologies.find(
        (t) => t.name.toLowerCase() === name.toLowerCase()
      );
      if (item) {
        item.count += mentionCount;
        if (earliestDate < item.firstSeen) item.firstSeen = earliestDate;
        if (latestDate > item.lastSeen) item.lastSeen = latestDate;
      } else {
        category.technologies.push({
          name,
          count: mentionCount,
          firstSeen: earliestDate,
          lastSeen: latestDate,
        });
      }
    }
  }
}

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract and aggregate a tech stack for a company from its job descriptions.
 * Processes jobs in batches to stay within token limits.
 */
export async function extractCompanyTechStack(
  companyName: string,
  jobs: { id: string; title: string; description_text: string | null; first_seen_date: string }[]
): Promise<CompanyTechStack> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  // Filter jobs that have descriptions
  const jobsWithDesc = jobs.filter((j) => j.description_text && j.description_text.length > 50);

  if (jobsWithDesc.length === 0) {
    return {
      categories: [],
      totalJobsAnalyzed: 0,
      generatedAt: new Date().toISOString(),
      periodStart: "",
      periodEnd: "",
    };
  }

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const stack: CompanyTechStack = {
    categories: [],
    totalJobsAnalyzed: 0,
    generatedAt: new Date().toISOString(),
    periodStart: "",
    periodEnd: "",
  };

  // Process in batches of 10 jobs to stay within token limits
  const BATCH_SIZE = 10;
  let batchesSucceeded = 0;
  for (let i = 0; i < jobsWithDesc.length; i += BATCH_SIZE) {
    const batch = jobsWithDesc.slice(i, i + BATCH_SIZE);

    // Truncate descriptions to ~1500 chars each to keep prompt reasonable
    const jobData = batch
      .map((j) => {
        const desc = (j.description_text ?? "").slice(0, 1500);
        return `--- ${j.title} (${j.first_seen_date}) ---\n${desc}`;
      })
      .join("\n\n");

    const prompt = EXTRACTION_PROMPT.replace("{job_data}", jobData);

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const text = result.response.text()?.trim() ?? "{}";
      const parsed = JSON.parse(text) as JobTechExtraction;

      // Merge batch extraction once, using the most recent job date as reference
      const batchDates = batch.map((j) => j.first_seen_date).sort();
      const earliestDate = batchDates[0];
      const latestDate = batchDates[batchDates.length - 1];
      mergeIntoStack(stack, parsed, earliestDate, latestDate);
      batchesSucceeded++;
      stack.totalJobsAnalyzed += batch.length;
    } catch (error) {
      console.error(
        `Tech stack extraction error (batch ${i / BATCH_SIZE + 1}):`,
        error
      );
      // Continue with next batch on error
    }
  }

  if (batchesSucceeded === 0) {
    throw new Error("All batches failed during tech stack extraction");
  }

  // Sort technologies within each category by count (descending)
  for (const cat of stack.categories) {
    cat.technologies.sort((a, b) => b.count - a.count);
  }

  // Sort categories by total count
  stack.categories.sort(
    (a, b) =>
      b.technologies.reduce((s, t) => s + t.count, 0) -
      a.technologies.reduce((s, t) => s + t.count, 0)
  );

  // Set period bounds
  const allDates = jobsWithDesc.map((j) => j.first_seen_date).sort();
  stack.periodStart = allDates[0] ?? "";
  stack.periodEnd = allDates[allDates.length - 1] ?? "";

  return stack;
}

// Re-export for use by aggregation module
export { NORMALIZATION_MAP, CATEGORY_LABELS, normalizeTechName };

// ============================================================================
// Gemini Pro Enrichment (Categorization + Narration in one pass)
// ============================================================================

import type { FlatTechMention } from "./tech-stack-aggregation";

/** Result shape from the LLM enrichment call */
interface EnrichmentResult {
  architectSummary?: string;
  categories?: {
    category: string;
    label: string;
    technologies: string[];
    narrativeSummary?: string;
  }[];
}

function buildTechLookupKey(value: string) {
  return normalizeTechName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const HEURISTIC_CATEGORY_CONFIG: Array<{
  category: string;
  label: string;
  keywords: string[];
}> = [
  {
    category: "financial_systems",
    label: "Financial Systems",
    keywords: [
      "fundserv",
      "aton",
      "cmhc",
      "genworth",
      "mastercard",
      "visa",
      "swift",
      "kyriba",
      "modern treasury",
      "trm labs",
      "chainalysis",
      "elliptic",
      "cds",
      "dtc",
      "dtcc",
      "acats",
      "banking",
      "payments",
      "credit",
      "mortgage",
    ],
  },
  {
    category: "application_stack",
    label: "Application Stack",
    keywords: [
      "python",
      "java",
      "javascript",
      "typescript",
      "node.js",
      "spring boot",
      "ruby",
      "rails",
      "react",
      "swiftui",
      "swift",
      "kotlin",
      "ios",
      "android",
      "html",
      "css",
      "objective-c",
      "uikit",
      "android jetpack",
      "coroutines",
      "livedata",
      "flow",
    ],
  },
  {
    category: "platform_infrastructure",
    label: "Platform Infrastructure",
    keywords: [
      "gcp",
      "aws",
      "azure",
      "kubernetes",
      "docker",
      "terraform",
      "git",
      "github",
      "gitlab",
      "jenkins",
      "linux",
      "windows server",
      "active directory",
      "servicenow",
      "sccm",
      "scom",
      "dynatrace",
      "sumo logic",
      "cyberark",
      "vmware",
      "powershell",
      "ansible",
      "anthos",
      "datapower",
      "akamai",
      "crowdstrike",
      "tanium",
      "tenable",
      "splunk",
      "pagerduty",
      "websphere",
      "aix",
      "exchange",
      "artifactory",
      "sonarqube",
      "bitbucket",
    ],
  },
  {
    category: "data_ai",
    label: "Data & AI",
    keywords: [
      "bigquery",
      "sql",
      "sql server",
      "oracle",
      "vertex ai",
      "sas",
      "apache airflow",
      "informatica",
      "power bi",
      "looker",
      "firebase",
      "analytics",
      "machine learning",
      "dbt",
      "snowflake",
      "redshift",
      "airflow",
      "rag",
      "llm",
      "ai",
    ],
  },
  {
    category: "business_operations",
    label: "Business Operations",
    keywords: [
      "coupa",
      "peoplesoft",
      "anaplan",
      "adobe",
      "braze",
      "sketch",
      "invision",
      "axure",
      "proto.io",
      "project clarity",
      "smartview",
      "oracle obi",
      "tidal enterprise scheduler",
      "think-cell",
      "doubleclick",
      "appnexus",
      "journey optimizer",
    ],
  },
];

function buildHeuristicCategories(technologies: FlatTechMention[]): TechCategory[] {
  const categories = new Map<string, TechCategory>();

  for (const config of HEURISTIC_CATEGORY_CONFIG) {
    categories.set(config.category, {
      category: config.category,
      label: config.label,
      technologies: [],
    });
  }

  for (const technology of technologies) {
    const normalized = buildTechLookupKey(technology.name);
    const matchedCategory = HEURISTIC_CATEGORY_CONFIG.find((config) =>
      config.keywords.some((keyword) => normalized.includes(buildTechLookupKey(keyword)))
    );

    const categoryKey = matchedCategory?.category ?? "other";
    if (!categories.has(categoryKey)) {
      categories.set(categoryKey, {
        category: "other",
        label: "Technologies",
        technologies: [],
      });
    }

    categories.get(categoryKey)?.technologies.push({
      name: technology.name,
      count: technology.count,
      firstSeen: technology.firstSeen,
      lastSeen: technology.lastSeen,
    });
  }

  return [...categories.values()]
    .filter((category) => category.technologies.length > 0)
    .map((category) => ({
      ...category,
      technologies: category.technologies.sort((left, right) => right.count - left.count),
    }));
}

function buildHeuristicArchitectSummary(companyName: string, categories: TechCategory[]) {
  const topCategories = categories
    .slice(0, 3)
    .map((category) => {
      const topTechnologies = category.technologies
        .slice(0, 3)
        .map((technology) => technology.name)
        .join(", ");
      return `${category.label} (${topTechnologies})`;
    })
    .join("; ");

  const hasInfrastructure = categories.some((category) => category.category === "platform_infrastructure");
  const hasData = categories.some((category) => category.category === "data_ai");
  const posture = hasInfrastructure && hasData
    ? "a hybrid estate balancing cloud modernization with data and AI investment"
    : "a mixed estate spanning multiple layers of the platform";

  return `${companyName}'s hiring signals point to ${posture}. The strongest technology clusters are ${topCategories}.`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

/**
 * Categorize and enrich a flat list of technology mentions using Gemini Pro.
 * This replaces the old two-step approach (hardcoded categorization + separate enrichment).
 * The LLM handles both categorization and narrative generation in a single pass.
 */
export async function enrichTechStackWithAnalysis(
  companyName: string,
  technologies: FlatTechMention[],
  totalJobsAnalyzed: number,
  periodStart: string,
  periodEnd: string,
  strategicContext: string,
  config: TechStackAiConfig = DEFAULT_TECH_STACK_AI_CONFIG
): Promise<CompanyTechStack> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  // Base stack to return if enrichment fails
  const baseStack: CompanyTechStack = {
    categories: [],
    totalJobsAnalyzed,
    generatedAt: new Date().toISOString(),
    periodStart,
    periodEnd,
  };

  if (technologies.length === 0) {
    return baseStack;
  }

  // Build compact representation for the prompt
  const techData = technologies.map((t) => ({
    name: t.name,
    mentions: t.count,
    firstSeen: t.firstSeen,
    lastSeen: t.lastSeen,
  }));

  const prompt = config.promptTemplate
    .replace("{company_name}", companyName)
    .replace("{tech_data}", JSON.stringify(techData, null, 2))
    .replace("{strategic_context}", strategicContext)
    .replace("{total_jobs}", String(totalJobsAnalyzed))
    .replace("{period_start}", periodStart)
    .replace("{period_end}", periodEnd);

  try {
    // Build a lookup from tech name → flat mention data
    const techLookup = new Map<string, FlatTechMention>();
    for (const t of technologies) {
      const variants = new Set([
        t.name.toLowerCase(),
        normalizeTechName(t.name).toLowerCase(),
        buildTechLookupKey(t.name),
      ]);

      for (const variant of variants) {
        techLookup.set(variant, t);
      }
    }

    const genAI = new GoogleGenerativeAI(key);

    for (let attempt = 0; attempt < 2; attempt++) {
      const model = genAI.getGenerativeModel({
        model: config.model,
        generationConfig: {
          temperature: attempt === 0 ? config.temperature : Math.min(config.temperature, 0.1),
          maxOutputTokens: config.maxOutputTokens,
          responseMimeType: "application/json",
        },
      });

      const result = await withTimeout(
        model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
        GEMINI_REQUEST_TIMEOUT_MS,
        `Gemini tech stack enrichment for "${companyName}" (attempt ${attempt + 1})`
      );

      const text = result.response.text()?.trim() ?? "{}";
      const parsed = JSON.parse(text) as EnrichmentResult;
      const candidateCategories: CompanyTechStack["categories"] = [];

      if (parsed.architectSummary) {
        baseStack.architectSummary = parsed.architectSummary;
      }

      if (parsed.categories) {
        for (const cat of parsed.categories) {
          const techItems: TechItem[] = [];
          for (const techName of cat.technologies) {
            const mention =
              techLookup.get(techName.toLowerCase()) ??
              techLookup.get(normalizeTechName(techName).toLowerCase()) ??
              techLookup.get(buildTechLookupKey(techName));
            if (mention) {
              techItems.push({
                name: mention.name,
                count: mention.count,
                firstSeen: mention.firstSeen,
                lastSeen: mention.lastSeen,
              });
            }
          }

          if (techItems.length > 0) {
            candidateCategories.push({
              category: cat.category,
              label: cat.label,
              technologies: techItems,
              narrativeSummary: cat.narrativeSummary,
            });
          }
        }
      }

      if (candidateCategories.length > 1 || (candidateCategories.length > 0 && parsed.architectSummary)) {
        baseStack.categories = candidateCategories;
        break;
      }

      if (attempt === 1 && candidateCategories.length > 0) {
        baseStack.categories = candidateCategories;
      }
    }

    if (baseStack.categories.length < 2) {
      const heuristicCategories = buildHeuristicCategories(technologies);
      if (heuristicCategories.length > baseStack.categories.length) {
        baseStack.categories = heuristicCategories;
      }
    }

    if (baseStack.categories.length === 0) {
      baseStack.categories = buildHeuristicCategories(technologies);

      if (baseStack.categories.length === 0) {
        baseStack.categories = [{
          category: "other",
          label: "Technologies",
          technologies: technologies.map((t) => ({
            name: t.name,
            count: t.count,
            firstSeen: t.firstSeen,
            lastSeen: t.lastSeen,
          })),
        }];
      }
    }

    if (!baseStack.architectSummary && baseStack.categories.length > 0) {
      baseStack.architectSummary = buildHeuristicArchitectSummary(companyName, baseStack.categories);
    }
  } catch (error) {
    console.error("Tech stack enrichment error:", error);
    baseStack.categories = buildHeuristicCategories(technologies);

    if (baseStack.categories.length === 0) {
      // Fallback: put everything in a single "other" category without narratives
      baseStack.categories = [{
        category: "other",
        label: "Technologies",
        technologies: technologies.map((t) => ({
          name: t.name,
          count: t.count,
          firstSeen: t.firstSeen,
          lastSeen: t.lastSeen,
        })),
      }];
    }

    if (!baseStack.architectSummary && baseStack.categories.length > 0) {
      baseStack.architectSummary = buildHeuristicArchitectSummary(companyName, baseStack.categories);
    }
  }

  return baseStack;
}
