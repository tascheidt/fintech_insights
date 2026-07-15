import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const PROMPT_STAGES = ["job-structure", "tech-stack", "weekly-digest"] as const;
export type PromptStage = (typeof PROMPT_STAGES)[number];

export const AI_MODEL_OPTIONS = [
  {
    value: "gemini-flash-latest",
    label: "Gemini Flash",
    summary: "Fastest for extraction and iteration rounds. Uses the `-latest` alias, so the active version is whatever Google currently marks as Flash-latest.",
    recommendedStages: ["job-structure", "tech-stack", "weekly-digest"],
  },
  {
    value: "gemini-flash-lite-latest",
    label: "Gemini Flash-Lite",
    summary: "Cheapest tier (roughly a third of Flash's token price). Enabled here for comparison against Flash on structured-extraction surfaces; swap in only where the `gemini-compare.ts` report shows L1 field agreement >= 95%.",
    recommendedStages: ["job-structure"],
  },
  {
    value: "gemini-pro-latest",
    label: "Gemini Pro",
    summary: "Best for deeper reasoning and narrative quality.",
    recommendedStages: ["job-structure", "tech-stack", "weekly-digest"],
  },
] as const;

export const AI_MODEL_VALUES = AI_MODEL_OPTIONS.map((option) => option.value) as [
  (typeof AI_MODEL_OPTIONS)[number]["value"],
  ...(typeof AI_MODEL_OPTIONS)[number]["value"][],
];

/**
 * Embedding model for Jobs semantic search. Kept separate from
 * `AI_MODEL_OPTIONS` (those are user-selectable text-gen tiers) but still the
 * single source of truth — resolve every embedding model string through here,
 * never hardcode it elsewhere.
 *
 * Unlike the text-gen tiers, Google does NOT publish a floating `-latest`
 * alias for embeddings; they are versioned explicitly. We therefore pin the
 * version deliberately and stamp it onto every embedded row
 * (`job_postings.embedding_model` / `embedding_dims`). Comparing vectors
 * produced by different models or dimensionalities is silently wrong, so a
 * change here MUST be paired with a re-embed backfill (the backfill detects
 * the mismatch and re-embeds). 768 dims is a Matryoshka truncation of the
 * native 3072 — a good size/quality trade for ~10k rows.
 */
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMS = 768;

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

export const WeeklyDigestAiConfigSchema = BaseAiConfigSchema.extend({
  stage: z.literal("weekly-digest"),
});

export type JobStructureAiConfig = z.infer<typeof JobStructureAiConfigSchema>;
export type TechStackAiConfig = z.infer<typeof TechStackAiConfigSchema>;
export type WeeklyDigestAiConfig = z.infer<typeof WeeklyDigestAiConfigSchema>;

export const SYSTEM_PROMPT_KEYS = {
  jobStructure: "job_structure_ai",
  techStack: "tech_stack_ai",
  weeklyDigest: "weekly_digest_ai",
} as const;

const REQUIRED_PLACEHOLDERS: Record<PromptStage, string[]> = {
  "job-structure": ["{job_title}", "{raw_department}", "{description}", "{categories}"],
  "tech-stack": [
    "{company_name}",
    "{tech_data}",
    "{strategic_context}",
    "{total_jobs}",
    "{period_start}",
    "{period_end}",
  ],
  "weekly-digest": [
    "{company_name}",
    "{week_job_count}",
    "{current_open_job_count}",
    "{year_to_date_job_count}",
    "{weekly_role_themes}",
    "{open_role_themes}",
    "{year_to_date_role_themes}",
    "{continuing_themes}",
    "{new_themes}",
    "{sample_titles}",
    "{previous_weeks}",
  ],
};

export const DEFAULT_JOB_STRUCTURE_PROMPT = `Analyze this fintech job description and extract the structured fields below.

You are acting as a senior fintech technical recruiter and taxonomy specialist. Your job is to capture only high-signal, evidence-backed details of job descriptions you review. For technical platforms you use your knowledge or research of technologies applied to support financial services businesses to normalize them into clear product or platform names.

Job Title: {job_title}
Raw Department (from ATS): {raw_department}
Note: The raw department may be empty, null, or invalid. Use it only as a weak hint. The description is the source of truth.

Job Description:
{description}

IMPORTANT RULES FOR tech_stack:
- Extract only technologies, tools, vendors, platforms, frameworks, languages, databases, cloud services, observability tools, CI/CD tools, and fintech domain systems that are explicitly named in the description.
- Never infer a technology from responsibilities. If the description says "cloud infrastructure" but does not name AWS, GCP, or Azure, do not add a cloud platform.
- Prefer fewer high-confidence technologies over padded lists.
- Normalize to canonical names when obvious. Examples: Postgres -> PostgreSQL, Amazon Web Services -> AWS, K8s -> Kubernetes, React.js -> React, NodeJS -> Node.js.
- Keep specific fintech systems when named. Examples: Temenos, Engine, Broadridge, FIS, Finastra, Mambu, Stripe, Plaid, Adyen, Jack Henry, FICO, nCino, Q2, Envestnet,  Kafka.
- Include common enterprise software packages. Examples: SAP, Zendesk, Decagon, Saleforce.
- Include developer infrastructure when named. Examples: Docker, Kubernetes, Terraform, GitHub Actions, CircleCI, Datadog, Launch Darkly, ArgoCD, Redis, PostgreSQL, Databricks, Snowflake.
- Include machine learning and AI frameworks and libraries when named. Examples: PyTorch, Keras, SciKit-learn, sparkML.
- Exclude generic abstractions and role concepts. Examples: cloud, APIs, microservices, distributed systems, machine learning, analytics, ETL, automation, architecture, object-oriented design, security best practices, real time rails, open banking.
- Exclude office/productivity tools and generic collaboration software. Examples: Excel, Word, PowerPoint, Outlook, MS Office, Google Docs, Slack, Zoom, Teams, SharePoint, Jira, Confluence, Notion, Miro, LLM.
- Exclude generic industry platforms. Examples: Mastercard, Visa, Interac, OSFI, Google, Meta, Tiktok.
- Exclude methodologies and certifications unless they are part of a named product. Examples: Agile, Scrum, Lean, PMP, SAFe, ISO 20022, IFRS.
- Exclude company specific products. Examples: Wealthsimple for Business.

IMPORTANT RULES FOR location:
- Always extract location from the description if present. Look for sections like "Location", "Location(s)", "Where you'll work", or explicit city/country references.

Return a JSON object with:
1. summary: concise 2-3 sentence summary (max 300 chars)
2. seniority_level: one of intern, junior, mid, senior, staff, principal, lead, executive
3. salary: object with min, max, currency, or null
4. tech_stack: array of the most important explicitly named technologies (ordered by signal strength)
5. keywords: broader skills/domains/topics (max 20, ordered by signal strength)
6. standardized_department: one of Engineering, Sales, Marketing, Product, Operations, Finance, Legal, HR, Customer Success, Support
7. function_category: must be one of {categories}
8. location: object with city, state, country, formatted, or null

Respond ONLY with valid JSON matching this structure:
{
  "summary": "...",
  "seniority_level": "senior",
  "salary": {"min": 120000, "max": 150000, "currency": "USD"} or null,
  "tech_stack": ["React", "TypeScript", "AWS", "Temenos"],
  "keywords": ["payments", "risk systems", "API integrations"],
  "standardized_department": "Engineering",
  "function_category": "engineering-backend",
  "location": {"city": "Toronto", "state": "Ontario", "country": "Canada", "formatted": "Toronto, Ontario, Canada"} or null
}`;

export const DEFAULT_TECH_STACK_PROMPT = `You are a fintech CTO and technical diligence advisor reviewing {company_name}'s hiring-derived technology footprint.

You have two evidence sources:
1. Direct hiring-derived technology mentions with counts and recency.
2. Company strategic context derived from strategic insights and verified research snippets.

Your job is to fuse those sources carefully.

CRITICAL EVIDENCE RULES:
- The technologies in category.technologies must come only from the Technology mentions input.
- You may use the strategic context to interpret what the stack implies, preserve exact named systems, and explain likely modernization or product direction.
- If a system or product name appears only in the strategic context, you may reference it in architectSummary or narrativeSummary, but do not add it to category.technologies unless it is also present in Technology mentions.
- Preserve exact names from the evidence when they are present. If the context says "Engine by Starling", do not downgrade that to a generic phrase like "core banking SaaS platform".
- Distinguish direct evidence from strategic interpretation. If a conclusion is inferential, say so.
- If hiring evidence and strategic context point in different directions, explain the tension instead of forcing certainty.

INPUT:
Technology mentions:
{tech_data}

Strategic context:
{strategic_context}

Total job postings analyzed: {total_jobs}
Period covered: {period_start} to {period_end}

Create a JSON object with:
{
  "architectSummary": "2-4 sentences that explain the company's technical posture in plain English",
  "categories": [
    {
      "category": "financial_systems",
      "label": "Financial Systems",
      "technologies": ["Temenos", "Stripe"],
      "narrativeSummary": "2-3 sentences explaining what these tools imply"
    }
  ]
}

Use these category IDs when relevant:
- financial_systems: payments, banking cores, card issuing, lending, risk, fraud, compliance, treasury, servicing, or other named financial operations systems
- application_stack: languages, frameworks, app runtimes, APIs, front-end and back-end product tooling
- platform_infrastructure: cloud, infrastructure, DevOps, observability, data movement, security tooling, developer platform signals
- data_ai: warehouses, BI, analytics, experimentation, ML, GenAI, feature pipelines
- business_operations: systems that suggest customer servicing, CRM, enterprise workflow support, support operations, or back-office platform posture
- other: low-volume leftovers that still matter

RUNTIME RULES:
- Use technology names exactly as provided in Technology mentions.
- Do not invent technologies or overstate confidence.
- Distinguish strong signals from weak signals. If evidence is thin, say so explicitly.
- Use counts and recency to talk about prominence or momentum when justified.
- Focus on insight: stack maturity, build-vs-buy posture, vendor dependence, platform sophistication, regulated-fintech readiness, and notable gaps.
- Avoid generic filler like "modern tech stack" or "focuses on innovation" unless you immediately anchor it in named evidence.
- Only include categories that actually have technologies assigned.
- No duplicate technologies across categories.
- Omit other if it would be mostly noise.

The narrative should answer:
- What is core vs secondary?
- What does this imply about product architecture and operating model?
- Which named systems or vendors matter strategically, and are they directly evidenced vs context-only?
- Where does the company appear opinionated or unusually finance-specific?
- What important uncertainty remains because hiring data and strategic context are both incomplete?`;

export const DEFAULT_WEEKLY_DIGEST_PROMPT = `You are the editor of a weekly fintech hiring brief. Subscribers read this every Monday, so your entry for this company must feel specifically written for THIS week — never assembled from stock phrases. Evidence-first, plain language, no hype.

Company: {company_name}

THIS WEEK'S DATA
New postings this week: {week_job_count}
Currently open roles: {current_open_job_count}
Roles posted year-to-date: {year_to_date_job_count}

Weekly role themes:
{weekly_role_themes}

Current open role themes:
{open_role_themes}

Year-to-date role themes:
{year_to_date_role_themes}

Themes continuing an established pattern: {continuing_themes}
Themes that are new this week: {new_themes}

Representative job titles this week:
{sample_titles}

RECENT WEEKS (what the brief already told readers about this company):
{previous_weeks}

Write JSON with exactly these fields:
{
  "headline": "6-12 words, plain and specific. Must not repeat the sentence shape of the recent-week headlines above.",
  "body": "See LENGTH RULE.",
  "new_signal": "One sentence naming ONLY the genuinely new thing this week and why it matters, quoting the job title(s) behind it. Use null when nothing is genuinely new."
}

LENGTH RULE — spend words where the signal is:
- Nothing genuinely new: body is ONE short sentence saying so plainly, plus at most one concrete detail (a title or a number). Do not pad a quiet week into three sentences.
- A real new signal or a notable number: body is 2-4 sentences that LEAD with the new or most interesting fact, then set it against the established pattern.

WRITING RULES:
- Lead with the most interesting specific fact, not the company's routine.
- Quote 1-2 actual job titles when they carry the story — a title like "Staff AI Platform Engineer" is more informative than any adjective.
- Use a number only when the number itself is the story (open roles climbing week over week, an unusual year-to-date total). A stat line under your text already shows the raw counts; never restate them mechanically.
- Use the recent-weeks context for memory: if a theme has now appeared several weeks running, say so ("third straight week of..."); if this week breaks with last week, note the break. Never claim a streak the context does not show.
- Say "nothing new" like a person would: "Same mix it has run all year." — short and direct.
- BANNED constructions (these made past issues read machine-written; do not use them or close variants): "This activity continues", "established year-to-date pattern", "aligns with the company's established", "no new trends were detected", "observed data", "establishes a baseline", "represents a minor addition", "suggests a minor".
- Do not open the body with "[Company] continues to hire" or "[Company] is still hiring" — earn any continuity framing with a specific detail instead of a stock opener.
- At most ONE clearly flagged inference ("that reads as...", "the kind of hire a company makes when..."). Everything else stays observational.
- Translate internal theme labels into natural prose: "risk and fraud" becomes "risk roles"; "ai and machine learning for risk" becomes "AI-risk work". Never paste a lowercase taxonomy label into a sentence.
- No hype, slang, emojis, exclamation marks, or dramatic strategy language. Only claim a new direction when the postings clearly support it.

Respond with ONLY valid JSON.`;

export const DEFAULT_JOB_STRUCTURE_AI_CONFIG: JobStructureAiConfig = {
  stage: "job-structure",
  model: "gemini-flash-latest",
  promptTemplate: DEFAULT_JOB_STRUCTURE_PROMPT,
  temperature: 0.2,
  maxOutputTokens: 4096,
  version: "prompt-forge-approved-acbaaacc",
  benchmarkScore: 74,
};

export const DEFAULT_TECH_STACK_AI_CONFIG: TechStackAiConfig = {
  stage: "tech-stack",
  model: "gemini-flash-latest",
  promptTemplate: DEFAULT_TECH_STACK_PROMPT,
  temperature: 0.25,
  maxOutputTokens: 4096,
  version: "prompt-forge-approved-ddaf1f4b",
  benchmarkScore: 93,
};

export const DEFAULT_WEEKLY_DIGEST_AI_CONFIG: WeeklyDigestAiConfig = {
  stage: "weekly-digest",
  model: "gemini-flash-latest",
  promptTemplate: DEFAULT_WEEKLY_DIGEST_PROMPT,
  // Slightly higher temperature than the extraction stages on purpose: the
  // editorial-v2 prompt asks for varied sentence structure, and 0.2 was one
  // of the reasons every entry converged on the same three-beat skeleton.
  temperature: 0.4,
  maxOutputTokens: 2048,
  version: "digest-editorial-v2",
  benchmarkScore: null,
};

function getStageSchema(stage: PromptStage) {
  if (stage === "job-structure") return JobStructureAiConfigSchema;
  if (stage === "tech-stack") return TechStackAiConfigSchema;
  return WeeklyDigestAiConfigSchema;
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
): JobStructureAiConfig | TechStackAiConfig | WeeklyDigestAiConfig {
  const schema = getStageSchema(stage);
  return schema.parse(input);
}

function parseStoredConfig<T extends JobStructureAiConfig | TechStackAiConfig | WeeklyDigestAiConfig>(
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
    .in("setting_key", [
      SYSTEM_PROMPT_KEYS.jobStructure,
      SYSTEM_PROMPT_KEYS.techStack,
      SYSTEM_PROMPT_KEYS.weeklyDigest,
    ]);

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
    weeklyDigest: parseStoredConfig(
      "weekly-digest",
      settingsMap.get(SYSTEM_PROMPT_KEYS.weeklyDigest),
      DEFAULT_WEEKLY_DIGEST_AI_CONFIG
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

export async function getActiveWeeklyDigestAiConfig() {
  const configs = await getActivePromptConfigs();
  return configs.weeklyDigest;
}

export async function savePromptConfig(options: {
  stage: PromptStage;
  config: JobStructureAiConfig | TechStackAiConfig | WeeklyDigestAiConfig;
  userId: string;
  benchmarkScore?: number | null;
}) {
  const supabase = createAdminClient();
  const key =
    options.stage === "job-structure"
      ? SYSTEM_PROMPT_KEYS.jobStructure
      : options.stage === "tech-stack"
        ? SYSTEM_PROMPT_KEYS.techStack
        : SYSTEM_PROMPT_KEYS.weeklyDigest;

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
          : options.stage === "tech-stack"
            ? "Active AI runtime configuration for company tech stack synthesis"
            : "Active AI runtime configuration for weekly digest company summaries",
      updated_by: options.userId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
