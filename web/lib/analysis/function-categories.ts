/**
 * Function Categories for Job Categorization
 * 
 * Defines ROLE_CATEGORIES enum and utilities for analyzing hiring by function.
 * All categorization now uses stored function_category from database (AI-extracted).
 * Used for company-level insights to analyze hiring by function.
 * 
 * Updated to fintech-specific taxonomy with 45 categories across 7 groups.
 */

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
  "other",
] as const;

export type RoleCategory = (typeof ROLE_CATEGORIES)[number];

/**
 * Category groups for high-level aggregation
 * 
 * Updated to 7 fintech-specific groups for better competitive intelligence.
 */
export const CATEGORY_GROUPS: Record<string, RoleCategory[]> = {
  Engineering: [
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
  ],
  "Product & Design": [
    "product-management",
    "product-design-ux",
    "product-research",
    "technical-program-management",
    "technical-writing",
  ],
  "Data & Analytics": [
    "data-science",
    "data-analytics-bi",
    "analytics-engineering",
  ],
  "Risk, Legal & Compliance": [
    "compliance",
    "aml-financial-crime",
    "fraud-trust-safety",
    "legal",
    "regulatory-affairs",
    "risk-management",
  ],
  "Go-To-Market": [
    "sales-account-executives",
    "account-management-customer-success",
    "customer-support",
    "business-development-partnerships",
    "solutions-engineering",
    "revenue-operations",
    "marketing-growth-performance",
    "marketing-product-brand",
    "developer-relations",
  ],
  "Finance & Strategy": [
    "finance-accounting",
    "strategic-finance-fpa",
    "capital-markets-treasury",
    "corporate-development-strategy",
    "investor-relations",
  ],
  "Operations & People": [
    "customer-support-cx",
    "customer-operations",
    "people-ops-hr",
    "talent-acquisition-recruiting",
    "it-internal-systems",
    "business-operations",
    "executive-leadership",
    "administrative",
  ],
  Other: ["other"],
};

/**
 * Get the high-level group for a role category
 */
export function getCategoryGroup(category: RoleCategory): string {
  for (const [group, categories] of Object.entries(CATEGORY_GROUPS)) {
    if (categories.includes(category)) {
      return group;
    }
  }
  return "Other";
}


/**
 * Get a human-readable label for a role category
 */
export function getCategoryLabel(category: RoleCategory): string {
  const labels: Record<RoleCategory, string> = {
    // Engineering
    "engineering-backend": "Backend Engineering",
    "engineering-frontend": "Frontend Engineering",
    "engineering-fullstack": "Full Stack Engineering",
    "engineering-mobile": "Mobile Engineering",
    "engineering-data": "Data Engineering",
    "engineering-ai-ml": "AI / ML Engineering",
    "engineering-platform-sre-devops": "Platform / SRE / DevOps",
    "engineering-security": "Security Engineering",
    "engineering-qa": "QA / Test Engineering",
    "engineering-management": "Engineering Management",
    // Product & Design
    "product-management": "Product Management",
    "product-design-ux": "Product Design / UX",
    "product-research": "User Research",
    "technical-program-management": "Technical Program Management",
    "technical-writing": "Technical Writing",
    // Data & Analytics
    "data-science": "Data Science",
    "data-analytics-bi": "Data Analytics / BI",
    "analytics-engineering": "Analytics Engineering",
    // Risk, Legal & Compliance
    "compliance": "Compliance",
    "aml-financial-crime": "AML / Financial Crime",
    "fraud-trust-safety": "Fraud / Trust & Safety",
    "legal": "Legal",
    "regulatory-affairs": "Regulatory Affairs",
    "risk-management": "Risk Management",
    // Go-To-Market
    "sales-account-executives": "Sales / Account Executives",
    "account-management-customer-success": "Account Management / Customer Success",
    "customer-support": "Customer Support",
    "business-development-partnerships": "Business Development / Partnerships",
    "solutions-engineering": "Solutions Engineering",
    "revenue-operations": "Revenue Operations",
    "marketing-growth-performance": "Marketing - Growth / Performance",
    "marketing-product-brand": "Marketing - Product & Brand",
    "developer-relations": "Developer Relations",
    // Finance & Strategy
    "finance-accounting": "Finance & Accounting",
    "strategic-finance-fpa": "Strategic Finance / FP&A",
    "capital-markets-treasury": "Capital Markets / Treasury",
    "corporate-development-strategy": "Corporate Development / Strategy",
    "investor-relations": "Investor Relations",
    // Operations & People
    "customer-support-cx": "Customer Support / CX",
    "customer-operations": "Customer Operations",
    "people-ops-hr": "People Ops / HR",
    "talent-acquisition-recruiting": "Talent Acquisition / Recruiting",
    "it-internal-systems": "IT / Internal Systems",
    "business-operations": "Business Operations",
    "executive-leadership": "Executive / Leadership",
    "administrative": "Administrative",
    // Other
    other: "Other",
  };
  return labels[category] || category;
}

/**
 * Categorize an array of jobs and return statistics
 */
export interface FunctionStats {
  category: RoleCategory;
  label: string;
  group: string;
  count: number;
  percentage: number;
}

/**
 * Categorize jobs using stored function_category from database.
 * Includes all jobs with valid function_category (including "other" for uncategorized).
 */
export function categorizeJobs(jobs: Array<{ title: string; function_category?: string | null }>): FunctionStats[] {
  const counts = new Map<RoleCategory, number>();
  
  // Filter to only jobs with valid function_category (including "other")
  const jobsWithCategory = jobs.filter(
    (job) => job.function_category && ROLE_CATEGORIES.includes(job.function_category as RoleCategory)
  );
  
  const total = jobsWithCategory.length;

  for (const job of jobsWithCategory) {
    const category = job.function_category as RoleCategory;
    counts.set(category, (counts.get(category) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([category, count]) => ({
      category,
      label: getCategoryLabel(category),
      group: getCategoryGroup(category),
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get statistics grouped by high-level category groups
 */
export interface GroupStats {
  group: string;
  count: number;
  percentage: number;
  categories: FunctionStats[];
}

export function getGroupStats(functionStats: FunctionStats[]): GroupStats[] {
  const groupMap = new Map<string, { count: number; categories: FunctionStats[] }>();
  const total = functionStats.reduce((sum, f) => sum + f.count, 0);

  for (const stat of functionStats) {
    const existing = groupMap.get(stat.group) || { count: 0, categories: [] };
    existing.count += stat.count;
    existing.categories.push(stat);
    groupMap.set(stat.group, existing);
  }

  return Array.from(groupMap.entries())
    .map(([group, data]) => ({
      group,
      count: data.count,
      percentage: total > 0 ? Math.round((data.count / total) * 100) : 0,
      categories: data.categories.sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count);
}
