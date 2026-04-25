import { GoogleGenerativeAI } from "@google/generative-ai";
import { log } from "@/lib/log";

/**
 * Job Categorizer for Template Library
 * 
 * Logic ported from src/analysis/categorizer.py to TypeScript for Vercel deployment.
 * Uses Gemini Flash for AI-based categorization and template extraction.
 */

// Fintech-specific role categories (must match function-categories.ts)
// Updated to 45 categories across 7 groups for better fintech competitive intelligence
export const ROLE_CATEGORIES = [
  // Group 1: Engineering (10 categories)
  "engineering-backend",
  "engineering-frontend",
  "engineering-fullstack",
  "engineering-mobile",
  "engineering-data",
  "engineering-ai-ml",
  "engineering-platform-sre-devops",
  "engineering-security",
  "engineering-qa",
  "engineering-management",
  // Group 2: Product & Design (5 categories)
  "product-management",
  "product-design-ux",
  "product-research",
  "technical-program-management",
  "technical-writing",
  // Group 3: Data & Analytics (3 categories)
  "data-science",
  "data-analytics-bi",
  "analytics-engineering",
  // Group 4: Risk, Legal & Compliance (6 categories)
  "compliance",
  "aml-financial-crime",
  "fraud-trust-safety",
  "legal",
  "regulatory-affairs",
  "risk-management",
  // Group 5: Go-To-Market (8 categories)
  "sales-account-executives",
  "account-management-customer-success",
  "customer-support",
  "business-development-partnerships",
  "solutions-engineering",
  "revenue-operations",
  "marketing-growth-performance",
  "marketing-product-brand",
  "developer-relations",
  // Group 6: Finance & Strategy (5 categories)
  "finance-accounting",
  "strategic-finance-fpa",
  "capital-markets-treasury",
  "corporate-development-strategy",
  "investor-relations",
  // Group 7: Operations & People (8 categories)
  "customer-support-cx",
  "customer-operations",
  "people-ops-hr",
  "talent-acquisition-recruiting",
  "it-internal-systems",
  "business-operations",
  "executive-leadership",
  "administrative",
  // Other
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

const CATEGORIZATION_PROMPT = `Analyze this fintech job posting and categorize it using the fintech-specific taxonomy.

Job Title: {job_title}
Company: {company_name}
Description:
{description}

**Available Categories (45 total, organized into 7 groups):**

**Group 1: Engineering** (10 categories)
- engineering-backend, engineering-frontend, engineering-fullstack, engineering-mobile
- engineering-data, engineering-ai-ml, engineering-platform-sre-devops
- engineering-security, engineering-qa, engineering-management

**Group 2: Product & Design** (5 categories)
- product-management, product-design-ux, product-research
- technical-program-management, technical-writing

**Group 3: Data & Analytics** (3 categories)
- data-science, data-analytics-bi, analytics-engineering

**Group 4: Risk, Legal & Compliance** (6 categories)
- compliance, aml-financial-crime, fraud-trust-safety
- legal, regulatory-affairs, risk-management

**Group 5: Go-To-Market** (8 categories)
- sales-account-executives, account-management-customer-success, customer-support
- business-development-partnerships, solutions-engineering, revenue-operations
- marketing-growth-performance, marketing-product-brand, developer-relations

**Group 6: Finance & Strategy** (5 categories)
- finance-accounting, strategic-finance-fpa, capital-markets-treasury
- corporate-development-strategy, investor-relations

**Group 7: Operations & People** (8 categories)
- customer-support-cx, customer-operations, people-ops-hr
- talent-acquisition-recruiting, it-internal-systems, business-operations
- executive-leadership, administrative

**Other:** other

**Edge Case Rules (CRITICAL for accuracy):**
- SQL/Data Pipelines/ETL → engineering-data (Data Engineering), NOT data-analytics-bi
- Excel/Financial Modeling/Accounting → finance-accounting, NOT data-analytics-bi
- Product Engineer → engineering-fullstack (if technical) OR product-management (if strategic/PM-focused)
- Marketing Engineer → engineering-frontend or engineering-fullstack (technical role), NOT marketing
- Platform Engineering/SRE → engineering-platform-sre-devops (distinct from generic DevOps in mature fintechs)
- Risk Modeling/Credit Scoring → data-science (predictive modeling), NOT risk-management
- Fraud Detection Operations → fraud-trust-safety, NOT risk-management
- Compliance Operations/KYC Review → compliance, NOT legal
- Legal Counsel/Contracts → legal, NOT compliance
- Data Science (ML models for risk/credit) → data-science, NOT engineering-ai-ml
- Analytics Engineering (dbt, data modeling) → analytics-engineering, NOT engineering-data
- Customer Support (tickets/calls) → customer-support-cx, NOT account-management-customer-success
- Customer Success (retention/upsell) → account-management-customer-success, NOT customer-support-cx

**Key Distinctions:**
- Platform/SRE/DevOps: Infrastructure, cloud, reliability (engineering-platform-sre-devops)
- Data Engineering: Pipelines, warehousing, ETL (engineering-data)
- Data Science: Predictive modeling, ML for business (data-science)
- Data Analytics/BI: Reporting, dashboards, analysis (data-analytics-bi)
- Analytics Engineering: dbt, data modeling, transformation (analytics-engineering)
- Compliance: KYC, KYB, regulatory operations (compliance)
- Legal: Corporate counsel, contracts, litigation (legal)
- Risk Management: Credit risk, market risk, liquidity (risk-management)
- Fraud/Trust & Safety: Fraud detection, trust operations (fraud-trust-safety)

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
 * Categorize a job posting and extract template sections using Gemini.
 */
export async function categorizePosting(
  jobTitle: string,
  companyName: string,
  description: string
): Promise<JobCategoryResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    log.error("GEMINI_API_KEY not configured");
    return null;
  }

  const prompt = CATEGORIZATION_PROMPT
    .replace("{job_title}", jobTitle)
    .replace("{company_name}", companyName)
    .replace("{description}", description.slice(0, 8000) || "No description")
    .replace("{categories}", ROLE_CATEGORIES.join(", "));

  try {
    const genAI = new GoogleGenerativeAI(key);
    
    // Using Gemini Flash (via `gemini-flash-latest`) as requested
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
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
    log.error({ err: error }, `Error categorizing posting '${jobTitle}':`);
    return null;
  }
}
