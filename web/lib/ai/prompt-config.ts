import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const PROMPT_STAGES = ["job-structure", "tech-stack"] as const;
export type PromptStage = (typeof PROMPT_STAGES)[number];

export const AI_MODEL_OPTIONS = [
  {
    value: "gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    summary: "Fastest for extraction and iteration rounds.",
    recommendedStages: ["job-structure", "tech-stack"],
  },
  {
    value: "gemini-pro-latest",
    label: "Gemini Pro",
    summary: "Best for deeper reasoning and narrative quality.",
    recommendedStages: ["job-structure", "tech-stack"],
  },
] as const;

export const AI_MODEL_VALUES = AI_MODEL_OPTIONS.map((option) => option.value) as [
  (typeof AI_MODEL_OPTIONS)[number]["value"],
  ...(typeof AI_MODEL_OPTIONS)[number]["value"][],
];

export type AllowedAiModel = (typeof AI_MODEL_OPTIONS)[number]["value"];

const BaseAiConfigSchema = z.object({
  model: z.enum(AI_MODEL_VALUES),
  promptTemplate: z.string().min(200).max(20000),
  temperature: z.number().min(0).max(1),
  maxOutputTokens: z.number().int().min(512).max(64000),
  version: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  benchmarkScore: z.number().min(0).max(100).nullable().optional(),
});

export const JobStructureAiConfigSchema = BaseAiConfigSchema.extend({
  stage: z.literal("job-structure"),
});

export const TechStackAiConfigSchema = BaseAiConfigSchema.extend({
  stage: z.literal("tech-stack"),
});

export type JobStructureAiConfig = z.infer<typeof JobStructureAiConfigSchema>;
export type TechStackAiConfig = z.infer<typeof TechStackAiConfigSchema>;

export const SYSTEM_PROMPT_KEYS = {
  jobStructure: "job_structure_ai",
  techStack: "tech_stack_ai",
} as const;

const REQUIRED_PLACEHOLDERS: Record<PromptStage, string[]> = {
  "job-structure": ["{job_title}", "{raw_department}", "{description}", "{categories}"],
  "tech-stack": ["{company_name}", "{tech_data}", "{total_jobs}", "{period_start}", "{period_end}"],
};

export const DEFAULT_JOB_STRUCTURE_PROMPT = `Analyze this fintech job description and extract the structured fields below.

You are acting as a senior fintech technical recruiter and taxonomy specialist. Your job is to capture only high-signal, evidence-backed technologies and normalize them into clear product or platform names.

Job Title: {job_title}
Raw Department (from ATS): {raw_department}
Note: The raw department may be empty, null, or invalid. Use it only as a weak hint. The description is the source of truth.

Job Description:
{description}

IMPORTANT RULES FOR tech_stack:
- Extract only technologies, tools, vendors, platforms, frameworks, languages, databases, cloud services, observability tools, CI/CD tools, and fintech domain systems that are explicitly named in the description.
- Never infer a technology from responsibilities. If the description says "cloud infrastructure" but does not name AWS, GCP, or Azure, do not add a cloud platform.
- Prefer fewer high-confidence technologies over padded lists.
- Normalize to canonical names when obvious: Postgres -> PostgreSQL, Amazon Web Services -> AWS, K8s -> Kubernetes, React.js -> React, NodeJS -> Node.js.
- Keep specific fintech systems when named: Temenos, FIS, Finastra, Mambu, Stripe, Plaid, Marqeta, Adyen, Jack Henry, FICO, nCino, Q2, Envestnet, Snowflake, Databricks, Kafka.
- Include developer infrastructure when named: Docker, Kubernetes, Terraform, GitHub Actions, CircleCI, Datadog, New Relic, ArgoCD, Redis, PostgreSQL, Snowflake.
- Exclude generic abstractions and role concepts: cloud, APIs, microservices, distributed systems, machine learning, analytics, ETL, automation, architecture, object-oriented design, security best practices.
- Exclude office/productivity tools and generic collaboration software: Excel, Word, PowerPoint, Outlook, MS Office, Google Docs, Slack, Zoom, Teams, SharePoint, Jira, Confluence, Notion, Miro.
- Exclude methodologies and certifications unless they are part of a named product: Agile, Scrum, Lean, PMP, SAFe.

IMPORTANT RULES FOR location:
- Always extract location from the description if present. Look for sections like "Location", "Location(s)", "Where you'll work", or explicit city/country references.

Return a JSON object with:
1. summary: concise 2-3 sentence summary (max 300 chars)
2. seniority_level: one of intern, junior, mid, senior, staff, principal, lead, executive
3. salary: object with min, max, currency, or null
4. tech_stack: array of the most important explicitly named technologies (max 12, ordered by signal strength)
5. keywords: broader skills/domains/topics (max 20, ordered by signal strength)
6. standardized_department: one of Engineering, Sales, Marketing, Product, Operations, Finance, Legal, HR, Customer Success, Support
7. function_category: must be one of {categories}
8. location: object with city, state, country, formatted, or null

Respond ONLY with valid JSON matching this structure:
{
  "summary": "...",
  "seniority_level": "senior",
  "salary": {"min": 120000, "max": 150000, "currency": "USD"} or null,
  "tech_stack": ["React", "TypeScript", "AWS"],
  "keywords": ["payments", "risk systems", "API integrations"],
  "standardized_department": "Engineering",
  "function_category": "engineering-backend",
  "location": {"city": "Toronto", "state": "Ontario", "country": "Canada", "formatted": "Toronto, Ontario, Canada"} or null
}`;

export const DEFAULT_TECH_STACK_PROMPT = `You are a fintech CTO and technical diligence advisor reviewing {company_name}'s hiring-derived technology footprint. You have a flat list of technologies extracted from job postings, plus mention counts and recency.

Your goal is not to restate the list. Your goal is to infer what the stack suggests about how this company builds, runs, and governs financial products.

INPUT:
Technology mentions:
{tech_data}

Total job postings analyzed: {total_jobs}
Period covered: {period_start} to {period_end}

Create a JSON object with:
{
  "architectSummary": "2-4 sentences that explain the company's technical posture in plain English",
  "categories": [
    {
      "category": "financial_systems",
      "label": "Financial Systems",
      "technologies": ["Stripe", "Plaid"],
      "narrativeSummary": "2-3 sentences explaining what these tools imply"
    }
  ]
}

Use these category IDs when relevant:
- financial_systems: payments, banking cores, card issuing, lending, risk, fraud, compliance, CRM or servicing systems tied to financial operations
- application_stack: languages, frameworks, app runtimes, APIs, front-end and back-end product tooling
- platform_infrastructure: cloud, infrastructure, DevOps, observability, data movement, security tooling, developer platform signals
- data_ai: warehouses, BI, analytics, experimentation, ML, GenAI, feature pipelines
- business_operations: systems that suggest servicing, operations, support, workflow automation, or enterprise workflow posture
- other: low-volume leftovers that still matter

RULES:
- Use technology names exactly as provided in the input.
- Do not invent technologies or overstate confidence.
- Distinguish strong signals from weak signals. If evidence is thin, say so explicitly.
- Use counts and recency to talk about prominence or momentum when justified.
- Focus on insight: stack maturity, build-vs-buy posture, vendor dependence, platform sophistication, regulated-fintech readiness, and notable gaps.
- Avoid generic filler like "modern tech stack" or "focuses on innovation" unless you immediately anchor it in the evidence.
- Only include categories that actually have technologies assigned.
- No duplicate technologies across categories.
- Omit other if it would be mostly noise.

The narrative should answer:
- What is core vs secondary?
- What does this imply about product architecture and operating model?
- Where does the company appear opinionated or unusually finance-specific?
- What important uncertainty remains because hiring data is imperfect?`;

export const DEFAULT_JOB_STRUCTURE_AI_CONFIG: JobStructureAiConfig = {
  stage: "job-structure",
  model: "gemini-3-flash-preview",
  promptTemplate: DEFAULT_JOB_STRUCTURE_PROMPT,
  temperature: 0.2,
  maxOutputTokens: 4096,
  version: "default-job-structure-v2",
};

export const DEFAULT_TECH_STACK_AI_CONFIG: TechStackAiConfig = {
  stage: "tech-stack",
  model: "gemini-pro-latest",
  promptTemplate: DEFAULT_TECH_STACK_PROMPT,
  temperature: 0.25,
  maxOutputTokens: 4096,
  version: "default-tech-stack-v2",
};

function getStageSchema(stage: PromptStage) {
  return stage === "job-structure" ? JobStructureAiConfigSchema : TechStackAiConfigSchema;
}

export function getRequiredPlaceholders(stage: PromptStage) {
  return REQUIRED_PLACEHOLDERS[stage];
}

export function validatePromptTemplate(stage: PromptStage, promptTemplate: string) {
  const missingPlaceholders = REQUIRED_PLACEHOLDERS[stage].filter(
    (placeholder) => !promptTemplate.includes(placeholder)
  );

  return {
    missingPlaceholders,
    isValid: missingPlaceholders.length === 0,
  };
}

export function buildConfigVersion(stage: PromptStage) {
  return `${stage}-${new Date().toISOString()}`;
}

export function parsePromptConfig(
  stage: PromptStage,
  input: unknown
): JobStructureAiConfig | TechStackAiConfig {
  const schema = getStageSchema(stage);
  return schema.parse(input);
}

function parseStoredConfig<T extends JobStructureAiConfig | TechStackAiConfig>(
  stage: PromptStage,
  value: unknown,
  fallback: T
): T {
  try {
    const parsed = parsePromptConfig(stage, value) as T;
    const placeholderCheck = validatePromptTemplate(stage, parsed.promptTemplate);
    if (!placeholderCheck.isValid) {
      return fallback;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export async function getActivePromptConfigs() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("system_settings")
    .select("setting_key, setting_value, updated_at")
    .in("setting_key", [SYSTEM_PROMPT_KEYS.jobStructure, SYSTEM_PROMPT_KEYS.techStack]);

  const settingsMap = new Map((data ?? []).map((row) => [row.setting_key, row.setting_value]));

  return {
    jobStructure: parseStoredConfig(
      "job-structure",
      settingsMap.get(SYSTEM_PROMPT_KEYS.jobStructure),
      DEFAULT_JOB_STRUCTURE_AI_CONFIG
    ),
    techStack: parseStoredConfig(
      "tech-stack",
      settingsMap.get(SYSTEM_PROMPT_KEYS.techStack),
      DEFAULT_TECH_STACK_AI_CONFIG
    ),
  };
}

export async function getActiveJobStructureAiConfig() {
  const configs = await getActivePromptConfigs();
  return configs.jobStructure;
}

export async function getActiveTechStackAiConfig() {
  const configs = await getActivePromptConfigs();
  return configs.techStack;
}

export async function savePromptConfig(options: {
  stage: PromptStage;
  config: JobStructureAiConfig | TechStackAiConfig;
  userId: string;
  benchmarkScore?: number | null;
}) {
  const supabase = createAdminClient();
  const key =
    options.stage === "job-structure"
      ? SYSTEM_PROMPT_KEYS.jobStructure
      : SYSTEM_PROMPT_KEYS.techStack;

  const settingValue = {
    ...options.config,
    version: buildConfigVersion(options.stage),
    benchmarkScore: options.benchmarkScore ?? options.config.benchmarkScore ?? null,
  };

  const { data: existing } = await supabase
    .from("system_settings")
    .select("id")
    .eq("setting_key", key)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("system_settings")
      .update({
        setting_value: settingValue,
        updated_by: options.userId,
      })
      .eq("setting_key", key)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  const { data, error } = await supabase
    .from("system_settings")
    .insert({
      setting_key: key,
      setting_value: settingValue,
      description:
        options.stage === "job-structure"
          ? "Active AI runtime configuration for per-job structure extraction"
          : "Active AI runtime configuration for company tech stack synthesis",
      updated_by: options.userId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
