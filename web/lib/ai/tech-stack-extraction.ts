import { GoogleGenerativeAI } from "@google/generative-ai";

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
}

/** Raw extraction result from a single job description */
interface JobTechExtraction {
  languages: string[];
  frameworks: string[];
  databases: string[];
  cloud: string[];
  devops: string[];
  data_tools: string[];
  ai_ml: string[];
  other: string[];
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
  languages: "Languages",
  frameworks: "Frameworks & Libraries",
  databases: "Databases & Storage",
  cloud: "Cloud & Infrastructure",
  devops: "DevOps & CI/CD",
  data_tools: "Data & Analytics",
  ai_ml: "AI & Machine Learning",
  other: "Other Tools",
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

Respond with a JSON object categorizing each technology found:
{
  "languages": ["Python", "Go", "TypeScript"],
  "frameworks": ["React", "Django", "Spring Boot"],
  "databases": ["PostgreSQL", "Redis", "DynamoDB"],
  "cloud": ["AWS", "GCP", "Terraform"],
  "devops": ["Docker", "Kubernetes", "GitHub Actions"],
  "data_tools": ["Spark", "Airflow", "dbt", "Snowflake"],
  "ai_ml": ["PyTorch", "TensorFlow", "LangChain"],
  "other": ["Kafka", "Elasticsearch", "GraphQL"]
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
 * Increments counts and updates first/last seen dates.
 */
function mergeIntoStack(
  existing: CompanyTechStack,
  extraction: JobTechExtraction,
  jobDate: string
): void {
  for (const [categoryKey, techs] of Object.entries(extraction)) {
    if (!Array.isArray(techs) || techs.length === 0) continue;

    let category = existing.categories.find((c) => c.category === categoryKey);
    if (!category) {
      category = {
        category: categoryKey,
        label: CATEGORY_LABELS[categoryKey] ?? categoryKey,
        technologies: [],
      };
      existing.categories.push(category);
    }

    for (const rawName of techs) {
      const name = normalizeTechName(rawName);
      if (!name) continue;

      const item = category.technologies.find(
        (t) => t.name.toLowerCase() === name.toLowerCase()
      );
      if (item) {
        item.count += 1;
        if (jobDate < item.firstSeen) item.firstSeen = jobDate;
        if (jobDate > item.lastSeen) item.lastSeen = jobDate;
      } else {
        category.technologies.push({
          name,
          count: 1,
          firstSeen: jobDate,
          lastSeen: jobDate,
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
    model: "gemini-3-flash-preview",
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const stack: CompanyTechStack = {
    categories: [],
    totalJobsAnalyzed: jobsWithDesc.length,
    generatedAt: new Date().toISOString(),
    periodStart: "",
    periodEnd: "",
  };

  // Process in batches of 10 jobs to stay within token limits
  const BATCH_SIZE = 10;
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

      // Merge each job's date contribution
      for (const job of batch) {
        mergeIntoStack(stack, parsed, job.first_seen_date);
      }
    } catch (error) {
      console.error(
        `Tech stack extraction error (batch ${i / BATCH_SIZE + 1}):`,
        error
      );
      // Continue with next batch on error
    }
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
