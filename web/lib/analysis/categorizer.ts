import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Job Categorizer for Template Library
 * 
 * Logic ported from src/analysis/categorizer.py to TypeScript for Vercel deployment.
 * Uses regex heuristics for quick categorization and Gemini 3 Flash for deep analysis/extraction.
 */

// Common role categories in fintech (matching python source)
export const ROLE_CATEGORIES = [
  "engineering-backend",
  "engineering-frontend",
  "engineering-fullstack",
  "engineering-mobile",
  "engineering-data",
  "engineering-ml",
  "engineering-devops",
  "engineering-security",
  "engineering-qa",
  "product-management",
  "product-design",
  "product-research",
  "marketing-growth",
  "marketing-product",
  "marketing-content",
  "marketing-brand",
  "sales",
  "customer-success",
  "customer-support",
  "operations",
  "finance",
  "legal-compliance",
  "hr-people",
  "data-analytics",
  "risk",
  "leadership",
  "other"
] as const;

export type RoleCategory = typeof ROLE_CATEGORIES[number];

export interface ExtractedSections {
  summary: string;
  responsibilities: string[];
  requirements: string[];
  nice_to_have: string[];
  benefits: string[];
}

export interface JobCategoryResult {
  role_category: RoleCategory;
  extracted_sections: ExtractedSections;
  quality_score: number; // 1-5
}

const CATEGORIZATION_PROMPT = `Analyze this job posting and categorize it for a job template library.

Job Title: {job_title}
Company: {company_name}
Description:
{description}

Provide analysis in JSON format:
{
    "role_category": "<category from: {categories}>",
    "extracted_sections": {
        "summary": "<1-2 sentence role summary>",
        "responsibilities": ["<responsibility 1>", "<responsibility 2>", ...],
        "requirements": ["<requirement 1>", "<requirement 2>", ...],
        "nice_to_have": ["<nice to have 1>", ...],
        "benefits": ["<benefit 1>", ...]
    },
    "quality_score": <1-5 rating of how well-written this posting is>
}

Quality scoring guide:
5 = Excellent: Clear, comprehensive, well-structured
4 = Good: Most sections present, clear language
3 = Average: Basic information, some gaps
2 = Below average: Vague or missing key sections
1 = Poor: Minimal useful information

Respond ONLY with valid JSON.`;

/**
 * Quick categorization based on job title alone (no API call).
 */
export function quickCategorize(jobTitle: string): RoleCategory {
  const titleLower = jobTitle.toLowerCase();

  // Engineering categories
  if (["backend", "server", "api"].some(w => titleLower.includes(w))) return "engineering-backend";
  if (["frontend", "front-end", "ui ", "react", "vue", "angular"].some(w => titleLower.includes(w))) return "engineering-frontend";
  if (["full stack", "fullstack", "full-stack"].some(w => titleLower.includes(w))) return "engineering-fullstack";
  if (["mobile", "ios", "android", "swift", "kotlin"].some(w => titleLower.includes(w))) return "engineering-mobile";
  if (["data engineer", "etl", "pipeline"].some(w => titleLower.includes(w))) return "engineering-data";
  if (["machine learning", "ml ", "ai ", "deep learning"].some(w => titleLower.includes(w))) return "engineering-ml";
  if (["devops", "sre", "infrastructure", "platform", "cloud"].some(w => titleLower.includes(w))) return "engineering-devops";
  if (["security", "infosec", "cybersecurity"].some(w => titleLower.includes(w))) return "engineering-security";
  if (["qa ", "quality", "test engineer", "sdet"].some(w => titleLower.includes(w))) return "engineering-qa";
  if (["software", "engineer", "developer"].some(w => titleLower.includes(w)) && !["data", "ml", "ai"].some(w => titleLower.includes(w))) return "engineering-fullstack";

  // Product categories
  if (["product manager", "product lead", "pm ", "product owner"].some(w => titleLower.includes(w))) return "product-management";
  if (["product design", "ux ", "ui/ux", "user experience"].some(w => titleLower.includes(w))) return "product-design";
  if (["user research", "ux research"].some(w => titleLower.includes(w))) return "product-research";

  // Marketing categories
  if (["growth", "acquisition", "performance marketing"].some(w => titleLower.includes(w))) return "marketing-growth";
  if (["product market", "pmm"].some(w => titleLower.includes(w))) return "marketing-product";
  if (["content", "copywriter", "editorial"].some(w => titleLower.includes(w))) return "marketing-content";
  if (["brand", "creative"].some(w => titleLower.includes(w))) return "marketing-brand";
  if (titleLower.includes("marketing")) return "marketing-growth";

  // Other categories
  if (["sales", "account executive", "business development", "bdm"].some(w => titleLower.includes(w))) return "sales";
  if (["customer success", "csm"].some(w => titleLower.includes(w))) return "customer-success";
  if (["support", "customer service"].some(w => titleLower.includes(w))) return "customer-support";
  if (["operations", "ops "].some(w => titleLower.includes(w))) return "operations";
  if (["finance", "accounting", "controller"].some(w => titleLower.includes(w))) return "finance";
  if (["legal", "compliance", "regulatory"].some(w => titleLower.includes(w))) return "legal-compliance";
  if (["hr ", "people", "recruiter", "talent"].some(w => titleLower.includes(w))) return "hr-people";
  if (["analyst", "analytics", "data scientist", "bi "].some(w => titleLower.includes(w))) return "data-analytics";
  if (["risk", "fraud"].some(w => titleLower.includes(w))) return "risk";
  if (["vp ", "director", "head of", "chief", "cto", "cfo", "ceo"].some(w => titleLower.includes(w))) return "leadership";

  return "other";
}

/**
 * Categorize a job posting and extract template sections using Gemini 3.
 */
export async function categorizePosting(
  jobTitle: string,
  companyName: string,
  description: string
): Promise<JobCategoryResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("GEMINI_API_KEY not configured");
    return null;
  }

  const prompt = CATEGORIZATION_PROMPT
    .replace("{job_title}", jobTitle)
    .replace("{company_name}", companyName)
    .replace("{description}", description.slice(0, 8000) || "No description")
    .replace("{categories}", ROLE_CATEGORIES.join(", "));

  try {
    const genAI = new GoogleGenerativeAI(key);
    
    // Using Gemini 3 Flash Preview as requested
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 64000,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response.text()?.trim() ?? "{}";
    const parsed = JSON.parse(text) as Record<string, unknown>;

    return {
      role_category: (parsed.role_category as RoleCategory) || "other",
      extracted_sections: (parsed.extracted_sections as ExtractedSections) || {
        summary: "",
        responsibilities: [],
        requirements: [],
        nice_to_have: [],
        benefits: []
      },
      quality_score: typeof parsed.quality_score === 'number' ? parsed.quality_score : 3
    };
  } catch (error) {
    console.error(`Error categorizing posting '${jobTitle}':`, error);
    return null;
  }
}
