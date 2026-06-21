import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { ROLE_CATEGORIES, type RoleCategory } from "./function-categories";
import {
  DEFAULT_JOB_STRUCTURE_AI_CONFIG,
  type JobStructureAiConfig,
} from "@/lib/ai/prompt-config";
import { recordUsage, type OnUsage, type GeminiUsageMetadata } from "@/lib/ai/gemini-meter";
import { writeUsageEvent } from "@/lib/ai/gemini-telemetry";
import { resolveProvider } from "@/lib/ai/providers/registry";
import { openAiCompatGenerate } from "@/lib/ai/providers/openai-compat";
import { log } from "@/lib/log";

/**
 * Job Structure Extractor
 * 
 * Extracts structured data ("Silver Layer") from job descriptions using Gemini Flash.
 * Provides standardized fields for job_postings table.
 */

// Zod schema for structured location
const LocationSchema = z.object({
  city: z.string().nullable().describe("City name (e.g., 'Toronto', 'New York', 'London')"),
  state: z.string().nullable().describe("State, province, or region (e.g., 'Ontario', 'California', 'England')"),
  country: z.string().nullable().describe("Country name (e.g., 'Canada', 'United States', 'United Kingdom')"),
  formatted: z.string().nullable().describe("Formatted location string (e.g., 'Toronto, Ontario, Canada' or 'Toronto, Canada' if state is null)"),
}).nullable().describe("Structured location extracted from description. Look for 'Location(s):' section. Return null if not found.");

// Zod schema for job structure extraction
export const JobStructureSchema = z.object({
  summary: z.string().describe("2-3 sentence summary of what this role entails"),
  seniority_level: z.enum([
    "intern",
    "junior",
    "mid",
    "senior",
    "staff",
    "principal",
    "lead",
    "executive",
  ]).describe("Seniority level extracted from title and description"),
  salary: z.object({
    min: z.number().int().positive().nullable(),
    max: z.number().int().positive().nullable(),
    currency: z.string().default("USD"),
  }).nullable().describe("Salary range if found in description, null otherwise"),
  tech_stack: z.array(z.string()).describe("Array of specific technologies, frameworks, tools, or platforms mentioned"),
  keywords: z.array(z.string()).describe("Array of relevant keywords, skills, domains, topics, or concepts. Should be broader than tech_stack and include business domains, methodologies, and role-related terms"),
  standardized_department: z.string().describe("Standardized department name (e.g., 'Engineering', 'Sales', 'Marketing', 'Product', 'Operations')"),
  function_category: z.enum(ROLE_CATEGORIES as unknown as [RoleCategory, ...RoleCategory[]]).describe("Function category (role specialization) - what the person does, not where they sit in the org. Must be one of the predefined ROLE_CATEGORIES. Use 'other' if cannot be categorized."),
  location: LocationSchema,
});

export type JobStructure = z.infer<typeof JobStructureSchema>;

const GEMINI_REQUEST_TIMEOUT_MS = 30000;
const MAX_STAGE1_DESCRIPTION_CHARS = 6000;
const MIN_STAGE1_DESCRIPTION_CHARS = 3000;
const STAGE1_RETRY_DESCRIPTION_STEP = 1500;
const MAX_STAGE1_OUTPUT_TOKENS = 8192;

// Extended type for database insertion (flattened salary fields)
export interface JobStructureForDB extends Omit<JobStructure, "salary" | "location"> {
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  keywords: string[]; // Explicitly include keywords
  function_category: RoleCategory; // Always one of ROLE_CATEGORIES, "other" for uncategorized
  location_structured: {
    city: string | null;
    state: string | null;
    country: string | null;
    formatted: string | null;
  } | null;
}

interface ExtractJobStructureOptions {
  config?: JobStructureAiConfig;
  retryCount?: number;
  /** Optional observer for token/cost usage. Production default is undefined (no-op). */
  onUsage?: OnUsage;
  /**
   * Disable Gemini 2.5 reasoning ("thinking") tokens for this extraction.
   * Defaults to true — silver-layer extraction is a mechanical JSON task, so
   * reasoning tokens (~75% of per-call cost, billed at the output rate) are pure
   * waste. Flipped to false only by the internal one-shot degrade when the active
   * model alias rejects `thinkingBudget: 0`.
   */
  disableThinking?: boolean;
}

function resolveExtractOptions(
  options?: number | ExtractJobStructureOptions
): { config: JobStructureAiConfig; retryCount: number; onUsage?: OnUsage; disableThinking: boolean } {
  if (typeof options === "number") {
    return {
      config: DEFAULT_JOB_STRUCTURE_AI_CONFIG,
      retryCount: options,
      disableThinking: true,
    };
  }

  return {
    config: options?.config ?? DEFAULT_JOB_STRUCTURE_AI_CONFIG,
    retryCount: options?.retryCount ?? 0,
    onUsage: options?.onUsage,
    disableThinking: options?.disableThinking ?? true,
  };
}

function getRetryDescriptionLength(retryCount: number) {
  return Math.max(
    MIN_STAGE1_DESCRIPTION_CHARS,
    MAX_STAGE1_DESCRIPTION_CHARS - (retryCount * STAGE1_RETRY_DESCRIPTION_STEP)
  );
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
 * Extract structured data from a job description
 * 
 * @param jobTitle - The job title
 * @param description - The full job description text
 * @param rawDepartment - Optional raw department value from scraper (may be invalid)
 * @param retryCount - Internal retry counter (default: 0)
 * @returns Structured job data or null if extraction fails
 */
export async function extractJobStructure(
  jobTitle: string,
  description: string,
  rawDepartment?: string | null,
  options?: number | ExtractJobStructureOptions
): Promise<JobStructureForDB | null> {
  const { config, retryCount, onUsage, disableThinking } = resolveExtractOptions(options);
  // Eval-only seam: a Gemini model id (the production default) routes through
  // the existing Gemini path unchanged; an eval id (e.g. glm-5.2) routes to the
  // OpenAI-compatible provider. See lib/ai/providers/registry.ts.
  const provider = resolveProvider(config.model);
  const key = process.env.GEMINI_API_KEY;
  if (provider === "gemini" && !key) {
    log.error("GEMINI_API_KEY not configured");
    return null;
  }

  // Truncate description to avoid token limits and keep retries deterministic.
  const descriptionLimit = getRetryDescriptionLength(retryCount);
  const truncatedDescription = description.slice(0, descriptionLimit) || "No description available";
  const effectiveMaxOutputTokens = Math.min(config.maxOutputTokens, MAX_STAGE1_OUTPUT_TOKENS);

  const prompt = config.promptTemplate
    .replace("{job_title}", jobTitle)
    .replace("{raw_department}", rawDepartment || "null or empty")
    .replace("{description}", truncatedDescription)
    .replace("{categories}", ROLE_CATEGORIES.join(", "));

  let parsed: unknown = null;

  try {
    let responseText: string;
    let usageMetadata: GeminiUsageMetadata | null | undefined;
    let modelServed: string = config.model;
    const _startMs = Date.now();

    if (provider === "gemini") {
      const genAI = new GoogleGenerativeAI(key as string);

      // Use Gemini Flash with JSON mode for guaranteed structured output
      const generationConfig: NonNullable<
        Parameters<typeof genAI.getGenerativeModel>[0]["generationConfig"]
      > = {
        temperature: config.temperature,
        // Stage 1 should return a compact JSON payload. Cap output size to reduce
        // malformed/truncated responses even if the saved runtime config is overly generous.
        maxOutputTokens: effectiveMaxOutputTokens,
        responseMimeType: "application/json",
      };
      // thinkingBudget:0 disables Gemini 2.5 reasoning tokens. Extraction is a
      // mechanical JSON task; reasoning was ~75% of per-call cost (billed at the
      // output rate) for zero quality gain. The field is runtime-supported but
      // missing from @google/generative-ai@0.24.1's GenerationConfig type, so we
      // attach it past the typing gap (same approach as lib/ai/embeddings.ts).
      if (disableThinking) {
        (generationConfig as Record<string, unknown>).thinkingConfig = { thinkingBudget: 0 };
      }

      const model = genAI.getGenerativeModel({
        model: config.model,
        generationConfig,
      });

      const result = await withTimeout(
        model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
        GEMINI_REQUEST_TIMEOUT_MS,
        `Gemini extraction for "${jobTitle}"`
      );
      responseText = result.response.text()?.trim() ?? "";
      usageMetadata = result.response.usageMetadata;
    } else {
      // Open-model evaluation path (e.g. glm-5.2, deepseek-v4-flash via
      // Fireworks). Same prompt + JSON mode; usage mapped onto the meter shape
      // so telemetry/pricing are unchanged. Eval-only — never a production model.
      const r = await openAiCompatGenerate({
        model: config.model,
        prompt,
        jsonMode: true,
        temperature: config.temperature,
        maxOutputTokens: effectiveMaxOutputTokens,
        timeoutMs: GEMINI_REQUEST_TIMEOUT_MS,
      });
      responseText = r.text?.trim() ?? "";
      usageMetadata = r.usageMetadata;
      modelServed = r.modelServed;
    }

    // Record the usage once. Production telemetry always fires (fire-and-
    // forget DB write); the optional `onUsage` observer runs in parallel
    // for scripts that capture records in-memory.
    const _usage = recordUsage({
      callSite: "extractJobStructure",
      modelRequested: config.model,
      modelServed,
      groundingEnabled: false,
      usageMetadata,
      latencyMs: Date.now() - _startMs,
      status: "ok",
      extra: { retryCount, jobTitle, provider },
    });
    writeUsageEvent(_usage);
    onUsage?.(_usage);

    const text = responseText;
    
    // Log response for debugging (truncated to avoid log spam)
    if (!text || text.length === 0) {
      log.warn(`Empty response from Gemini for job "${jobTitle}"`);
      
      // Retry logic: attempt up to 2 retries for empty responses
      if (retryCount < 2) {
        log.info(`Retrying extraction for job "${jobTitle}" due to empty response (attempt ${retryCount + 2}/3)`);
        // Wait a bit before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return extractJobStructure(jobTitle, description, rawDepartment, {
          config,
          retryCount: retryCount + 1,
          onUsage,
        });
      }

      return null;
    }

    // Try to parse JSON, with fallback for malformed JSON
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      // Log the actual response for debugging (first 200 chars)
      const responsePreview = text.length > 200 ? text.substring(0, 200) + "..." : text;
      log.warn(`JSON parse failed for job "${jobTitle}". Response preview: ${responsePreview}`);
      
      // Try to extract JSON from text that might have markdown code blocks or extra text
      // First, try to find JSON in markdown code blocks
      const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        try {
          parsed = JSON.parse(codeBlockMatch[1]) as unknown;
          log.info(`Successfully extracted JSON from markdown code block for job "${jobTitle}"`);
        } catch {
          // Fall through to next attempt
        }
      }
      
      // If that didn't work, try to find any JSON object in the text
      if (parsed === null) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          let jsonText = jsonMatch[0].replace(/,(\s*[}\]])/g, '$1');
          
          try {
            // If JSON appears truncated (ends mid-field), try to close it gracefully
            // Check if it ends with incomplete string/array/object
            if (!jsonText.trim().endsWith('}')) {
              // Try to close incomplete arrays/objects
              const openBraces = (jsonText.match(/\{/g) || []).length;
              const closeBraces = (jsonText.match(/\}/g) || []).length;
              const openBrackets = (jsonText.match(/\[/g) || []).length;
              const closeBrackets = (jsonText.match(/\]/g) || []).length;
              
              // Close incomplete strings (if we're in the middle of a string value)
              if (jsonText.match(/"[^"]*$/)) {
                jsonText = jsonText.replace(/("[^"]*)$/, '$1"');
              }
              
              // Close incomplete arrays
              for (let i = closeBrackets; i < openBrackets; i++) {
                jsonText += ']';
              }
              
              // Close incomplete objects
              for (let i = closeBraces; i < openBraces; i++) {
                jsonText += '}';
              }
            }
            
            parsed = JSON.parse(jsonText) as unknown;
            log.info(`Successfully parsed JSON after fixing for job "${jobTitle}"`);
          } catch (fixError) {
            // Check if response was truncated (common with token limits)
            // Detect truncation: ends mid-string, mid-array, or incomplete object
            const endsMidString = jsonText.match(/"[^"]*$/);
            const endsMidArray = (jsonText.match(/\[/g) || []).length > (jsonText.match(/\]/g) || []).length;
            const endsMidObject = (jsonText.match(/\{/g) || []).length > (jsonText.match(/\}/g) || []).length;
            const isTruncated = endsMidString || endsMidArray || endsMidObject || text.length > 3000;
            
            if (isTruncated && retryCount < 2) {
              const nextRetryCount = retryCount + 1;
              const nextDescriptionLimit = getRetryDescriptionLength(nextRetryCount);
              log.warn(
                `Response appears truncated for job "${jobTitle}". Retrying with a shorter description (${nextDescriptionLimit} chars, attempt ${nextRetryCount + 1}/3).`
              );
              await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
              return extractJobStructure(jobTitle, description, rawDepartment, {
                config,
                retryCount: nextRetryCount,
                onUsage,
              });
            }
            
            // If not truncated or retries exhausted, try to extract partial data from what we have
            // This is a last resort - try to salvage what we can
            try {
              // Try to extract just the essential fields even if JSON is incomplete
              const partialMatch = jsonText.match(/"summary":\s*"([^"]*)"/);
              if (partialMatch) {
                log.warn(`Using partial extraction for job "${jobTitle}" - some fields may be missing`);
                // Return a minimal valid structure with what we can extract
                // This allows the job to be saved even if extraction wasn't perfect
                parsed = {
                  summary: partialMatch[1],
                  seniority_level: jsonText.match(/"seniority_level":\s*"([^"]*)"/)?.[1] || null,
                  standardized_department: jsonText.match(/"standardized_department":\s*"([^"]*)"/)?.[1] || null,
                  salary: null,
                  tech_stack: [],
                  keywords: [],
                  location_structured: null,
                  function_category: null,
                };
              } else {
                throw fixError; // Re-throw if we can't extract anything
              }
            } catch {
              // Final fallback: log and return null
              log.error(`Failed to parse JSON for job "${jobTitle}" after all extraction attempts. Error: ${fixError instanceof Error ? fixError.message : String(fixError)}`);
              // Only log problematic JSON snippet if it's reasonably short
              if (jsonMatch[0].length < 500) {
                log.error(`Problematic JSON snippet: ${jsonMatch[0]}`);
              }
              return null;
            }
          }
        } else {
          log.error(`No JSON found in response for job "${jobTitle}". Response length: ${text.length}, Preview: ${responsePreview}`);
          // Log full response if it's short enough to be useful
          if (text.length < 500) {
            log.error(`Full response: ${text}`);
          }
          
          // Retry logic: attempt up to 2 retries for empty/malformed responses
          if (retryCount < 2) {
            log.info(`Retrying extraction for job "${jobTitle}" (attempt ${retryCount + 2}/3)`);
            // Wait a bit before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return extractJobStructure(jobTitle, description, rawDepartment, {
              config,
              retryCount: retryCount + 1,
              onUsage,
            });
          }

          return null;
        }
      }
    }

    // Validate with Zod schema
    const validated = JobStructureSchema.parse(parsed);

    // Transform to database format (flatten salary object)
    const dbStructure: JobStructureForDB = {
      summary: validated.summary,
      seniority_level: validated.seniority_level,
      salary_min: validated.salary?.min ?? null,
      salary_max: validated.salary?.max ?? null,
      salary_currency: validated.salary?.currency ?? "USD",
      tech_stack: validated.tech_stack,
      keywords: validated.keywords || [],
      standardized_department: validated.standardized_department,
      function_category: validated.function_category,
      location_structured: validated.location,
    };

    return dbStructure;
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      log.error({ err: error.issues }, `Job structure validation error for "${jobTitle}":`);
      // Return partial data if possible (parsed is guaranteed to be set here)
      if (parsed !== null) {
        return extractPartialStructure(error, parsed);
      }
      return null;
    }

    // Handle other errors (API errors, etc.)
    log.error({ err: error }, `Job structure extraction error for "${jobTitle}":`);

    // One-shot degrade: if the active model alias rejects `thinkingBudget: 0`
    // (e.g. a future floating-alias rotation to a thinking-only variant), retry
    // once WITHOUT the thinking override. Independent of the transient retry
    // budget below, so the blast radius is one paid-thoughts call instead of
    // returning null for every job until someone notices.
    if (disableThinking && error instanceof Error) {
      const m = error.message.toLowerCase();
      if (
        m.includes("thinking") ||
        m.includes("budget") ||
        m.includes("invalid_argument") ||
        m.includes("invalid argument")
      ) {
        log.warn(
          `thinkingBudget:0 rejected for "${jobTitle}" — retrying once without it. Error: ${error.message}`
        );
        return extractJobStructure(jobTitle, description, rawDepartment, {
          config,
          retryCount,
          onUsage,
          disableThinking: false,
        });
      }
    }

    // Retry logic for API errors (rate limits, network issues, etc.)
    if (retryCount < 2 && error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      // Retry on rate limit, network, or transient errors
      if (
        errorMessage.includes('rate limit') ||
        errorMessage.includes('network') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('503') ||
        errorMessage.includes('429')
      ) {
        log.info(`Retrying extraction for job "${jobTitle}" due to ${errorMessage} (attempt ${retryCount + 2}/3)`);
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
        return extractJobStructure(jobTitle, description, rawDepartment, {
          config,
          retryCount: retryCount + 1,
          onUsage,
        });
      }
    }

    return null;
  }
}

/**
 * Attempt to extract partial structure from invalid response
 * Used as fallback when Zod validation fails
 */
function extractPartialStructure(
  zodError: z.ZodError,
  parsed: unknown
): JobStructureForDB | null {
  const parsedObj = parsed as Record<string, unknown>;

  try {
    // Try to extract what we can, with safe defaults
    const partial: JobStructureForDB = {
      summary: typeof parsedObj.summary === "string" ? parsedObj.summary : "",
      seniority_level: isValidSeniority(parsedObj.seniority_level)
        ? (parsedObj.seniority_level as JobStructure["seniority_level"])
        : "mid", // Safe default
      salary_min: extractSalaryValue(parsedObj.salary, "min"),
      salary_max: extractSalaryValue(parsedObj.salary, "max"),
      salary_currency: extractCurrency(parsedObj.salary),
      tech_stack: Array.isArray(parsedObj.tech_stack)
        ? (parsedObj.tech_stack as string[])
        : [],
      keywords: Array.isArray(parsedObj.keywords)
        ? (parsedObj.keywords as string[])
        : [],
      standardized_department:
        typeof parsedObj.standardized_department === "string"
          ? parsedObj.standardized_department
          : "",
      function_category: isValidRoleCategory(parsedObj.function_category)
        ? (parsedObj.function_category as RoleCategory)
        : "other", // Use "other" for uncategorized jobs
      location_structured: extractLocation(parsedObj.location),
    };

    return partial;
  } catch {
    return null;
  }
}

/**
 * Check if a value is a valid seniority level
 */
function isValidSeniority(value: unknown): value is JobStructure["seniority_level"] {
  const validLevels = [
    "intern",
    "junior",
    "mid",
    "senior",
    "staff",
    "principal",
    "lead",
    "executive",
  ];
  return typeof value === "string" && validLevels.includes(value);
}

/**
 * Check if a value is a valid role category
 */
function isValidRoleCategory(value: unknown): value is RoleCategory {
  return typeof value === "string" && ROLE_CATEGORIES.includes(value as RoleCategory);
}

/**
 * Extract salary value from salary object
 */
function extractSalaryValue(
  salary: unknown,
  field: "min" | "max"
): number | null {
  if (!salary || typeof salary !== "object") {
    return null;
  }

  const salaryObj = salary as Record<string, unknown>;
  const value = salaryObj[field];

  if (typeof value === "number" && value > 0) {
    return Math.round(value);
  }

  return null;
}

/**
 * Extract currency from salary object
 */
function extractCurrency(salary: unknown): string {
  if (!salary || typeof salary !== "object") {
    return "USD";
  }

  const salaryObj = salary as Record<string, unknown>;
  const currency = salaryObj.currency;

  return typeof currency === "string" ? currency : "USD";
}

/**
 * Extract location from parsed object
 */
function extractLocation(location: unknown): {
  city: string | null;
  state: string | null;
  country: string | null;
  formatted: string | null;
} | null {
  if (!location || typeof location !== "object") {
    return null;
  }

  const locationObj = location as Record<string, unknown>;
  
  return {
    city: typeof locationObj.city === "string" ? locationObj.city : locationObj.city === null ? null : null,
    state: typeof locationObj.state === "string" ? locationObj.state : locationObj.state === null ? null : null,
    country: typeof locationObj.country === "string" ? locationObj.country : locationObj.country === null ? null : null,
    formatted: typeof locationObj.formatted === "string" ? locationObj.formatted : locationObj.formatted === null ? null : null,
  };
}

/**
 * Validate if a department value is valid (not cookie/privacy-related text)
 * 
 * @param department - The department value to validate
 * @returns true if valid, false if invalid
 */
export function isValidDepartment(department: string | null | undefined): boolean {
  if (!department || department.trim().length === 0) {
    return false;
  }
  
  const lower = department.toLowerCase().trim();
  
  // Reject cookie/privacy-related text
  const badKeywords = [
    'cookie', 'cookies', 'accept', 'decline', 'preferences',
    'privacy', 'policy', 'gdpr', 'consent', 'manage',
    'necessary', 'analytics', 'marketing', 'functional',
    'settings', 'preferences', 'all cookies', 'essential',
    'strictly necessary', 'performance', 'targeting'
  ];
  
  if (badKeywords.some(keyword => lower.includes(keyword))) {
    return false;
  }
  
  // Reject very short or very long values (likely not a department)
  if (lower.length < 2 || lower.length > 100) {
    return false;
  }
  
  // Reject common non-department text patterns
  const nonDepartmentPatterns = [
    /^click/i,
    /^read more/i,
    /^learn more/i,
    /^apply/i,
    /^view/i,
    /^see/i,
  ];
  
  if (nonDepartmentPatterns.some(pattern => pattern.test(lower))) {
    return false;
  }
  
  return true;
}

/**
 * Validate if a location value is valid (not placeholder/search text)
 * 
 * @param location - The location value to validate
 * @returns true if valid, false if invalid/placeholder
 */
export function isValidLocation(location: string | null | undefined): boolean {
  if (!location || location.trim().length === 0) {
    return false;
  }
  
  const lower = location.toLowerCase().trim();
  
  // Reject placeholder/search text
  const placeholderPatterns = [
    'search by location',
    'select location',
    'choose location',
    'location search',
    'filter by location',
    'all locations',
    'any location',
    'multiple locations',
    'various locations',
    'location tbd',
    'to be determined',
    'multiple locations available',
    'various locations available',
    'location to be determined',
  ];
  
  if (placeholderPatterns.some(pattern => lower.includes(pattern))) {
    return false;
  }
  
  // Reject very short values (likely not a location)
  if (lower.length < 2) {
    return false;
  }
  
  // Reject common non-location text patterns
  const nonLocationPatterns = [
    /^click/i,
    /^select/i,
    /^choose/i,
    /^filter/i,
    /^search/i,
  ];
  
  if (nonLocationPatterns.some(pattern => pattern.test(lower))) {
    return false;
  }
  
  return true;
}

/**
 * Extract normalized title from job title
 * Simple normalization (can be enhanced with AI if needed)
 */
export function normalizeJobTitle(title: string): string {
  // Basic normalization: trim, remove extra spaces, capitalize properly
  return title
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word, index) => {
      // Capitalize first word and important words
      if (index === 0) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      // Keep common acronyms uppercase (e.g., "VP", "API", "ML")
      if (word.length <= 3 && word === word.toUpperCase()) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
