import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

/**
 * Job Structure Extractor
 * 
 * Extracts structured data ("Silver Layer") from job descriptions using Gemini 3 Flash.
 * Provides standardized fields for job_postings table.
 */

// Zod schema for job structure extraction
export const JobStructureSchema = z.object({
  summary: z.string().describe("2-3 sentence summary of the job role"),
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
  tech_stack: z.array(z.string()).describe("Array of technologies, frameworks, or tools mentioned"),
  standardized_department: z.string().describe("Standardized department name (e.g., 'Engineering', 'Sales', 'Marketing', 'Product', 'Operations')"),
});

export type JobStructure = z.infer<typeof JobStructureSchema>;

// Extended type for database insertion (flattened salary fields)
export interface JobStructureForDB extends Omit<JobStructure, "salary"> {
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
}

const EXTRACTION_PROMPT = `Analyze this job description and extract the following structured data.

Job Title: {job_title}

Job Description:
{description}

Extract and return a JSON object with:
1. **summary**: A concise 2-3 sentence summary of what this role entails
2. **seniority_level**: One of: intern, junior, mid, senior, staff, principal, lead, executive
   - Look at the job title and description for indicators (e.g., "Senior", "Principal", "Lead", "VP", "Director")
   - If unclear, infer from requirements (years of experience, scope of responsibility)
3. **salary**: Object with min, max (integers), and currency (default "USD")
   - Extract salary range if mentioned (e.g., "$120k-150k", "$100,000 - $130,000")
   - Return null if no salary information found
4. **tech_stack**: Array of specific technologies, frameworks, tools, or platforms mentioned
   - Examples: ["React", "Python", "AWS", "PostgreSQL", "Docker", "Kubernetes"]
   - Be specific and extract actual tech names, not generic terms
   - Include programming languages, frameworks, databases, cloud services, etc.
5. **standardized_department**: Standardized department name
   - Common values: "Engineering", "Sales", "Marketing", "Product", "Operations", "Finance", "Legal", "HR", "Customer Success", "Support"
   - Normalize variations (e.g., "Engineering" not "Software Engineering" or "Tech")

Respond ONLY with valid JSON matching this structure:
{
  "summary": "...",
  "seniority_level": "senior",
  "salary": {"min": 120000, "max": 150000, "currency": "USD"} or null,
  "tech_stack": ["React", "TypeScript", "AWS"],
  "standardized_department": "Engineering"
}`;

/**
 * Extract structured data from a job description
 * 
 * @param jobTitle - The job title
 * @param description - The full job description text
 * @returns Structured job data or null if extraction fails
 */
export async function extractJobStructure(
  jobTitle: string,
  description: string
): Promise<JobStructureForDB | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("GEMINI_API_KEY not configured");
    return null;
  }

  // Truncate description to avoid token limits (keep first 8000 chars)
  const truncatedDescription = description.slice(0, 8000) || "No description available";

  const prompt = EXTRACTION_PROMPT
    .replace("{job_title}", jobTitle)
    .replace("{description}", truncatedDescription);

  let parsed: unknown = null;

  try {
    const genAI = new GoogleGenerativeAI(key);

    // Use Gemini 3 Flash with JSON mode for guaranteed structured output
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        temperature: 0.2, // Lower temperature for more consistent extraction
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response.text()?.trim() ?? "{}";
    
    // Try to parse JSON, with fallback for malformed JSON
    try {
      parsed = JSON.parse(text) as unknown;
    } catch (parseError) {
      // Try to extract JSON from text that might have markdown code blocks or extra text
      // First, try to find JSON in markdown code blocks
      const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        try {
          parsed = JSON.parse(codeBlockMatch[1]) as unknown;
        } catch {
          // Fall through to next attempt
        }
      }
      
      // If that didn't work, try to find any JSON object in the text
      if (parsed === null) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            // Try to fix common JSON issues: trailing commas before closing braces/brackets
            let jsonText = jsonMatch[0].replace(/,(\s*[}\]])/g, '$1');
            
            parsed = JSON.parse(jsonText) as unknown;
          } catch {
            console.error(`Failed to parse JSON for job "${jobTitle}" after extraction attempts`);
            return null;
          }
        } else {
          console.error(`No JSON found in response for job "${jobTitle}"`);
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
      standardized_department: validated.standardized_department,
    };

    return dbStructure;
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      console.error(`Job structure validation error for "${jobTitle}":`, error.issues);
      // Return partial data if possible (parsed is guaranteed to be set here)
      if (parsed !== null) {
        return extractPartialStructure(error, parsed);
      }
      return null;
    }

    // Handle other errors (API errors, etc.)
    console.error(`Job structure extraction error for "${jobTitle}":`, error);
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
      standardized_department:
        typeof parsedObj.standardized_department === "string"
          ? parsedObj.standardized_department
          : "",
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
