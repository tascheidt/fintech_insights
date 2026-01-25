/**
 * Function Categories for Job Categorization
 * 
 * Port of Python categorizer.py ROLE_CATEGORIES and quick_categorize() logic.
 * Used for company-level insights to analyze hiring by function.
 */

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
  "other",
] as const;

export type RoleCategory = (typeof ROLE_CATEGORIES)[number];

/**
 * Category groups for high-level aggregation
 */
export const CATEGORY_GROUPS: Record<string, RoleCategory[]> = {
  Engineering: [
    "engineering-backend",
    "engineering-frontend",
    "engineering-fullstack",
    "engineering-mobile",
    "engineering-data",
    "engineering-ml",
    "engineering-devops",
    "engineering-security",
    "engineering-qa",
  ],
  Product: ["product-management", "product-design", "product-research"],
  Marketing: ["marketing-growth", "marketing-product", "marketing-content", "marketing-brand"],
  "Go-to-Market": ["sales", "customer-success", "customer-support"],
  Operations: ["operations", "finance", "legal-compliance", "hr-people", "data-analytics", "risk"],
  Leadership: ["leadership"],
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
 * Quick categorization based on job title alone (no API call).
 * Port of Python categorizer.py quick_categorize() method.
 */
export function quickCategorize(jobTitle: string): RoleCategory {
  const titleLower = jobTitle.toLowerCase();

  // Engineering categories
  if (["backend", "server", "api"].some((w) => titleLower.includes(w))) {
    return "engineering-backend";
  }
  if (["frontend", "front-end", "ui ", "react", "vue", "angular"].some((w) => titleLower.includes(w))) {
    return "engineering-frontend";
  }
  if (["full stack", "fullstack", "full-stack"].some((w) => titleLower.includes(w))) {
    return "engineering-fullstack";
  }
  if (["mobile", "ios", "android", "swift", "kotlin"].some((w) => titleLower.includes(w))) {
    return "engineering-mobile";
  }
  if (["data engineer", "etl", "pipeline"].some((w) => titleLower.includes(w))) {
    return "engineering-data";
  }
  if (["machine learning", "ml ", "ai ", "deep learning"].some((w) => titleLower.includes(w))) {
    return "engineering-ml";
  }
  if (["devops", "sre", "infrastructure", "platform", "cloud"].some((w) => titleLower.includes(w))) {
    return "engineering-devops";
  }
  if (["security", "infosec", "cybersecurity"].some((w) => titleLower.includes(w))) {
    return "engineering-security";
  }
  if (["qa ", "quality", "test engineer", "sdet"].some((w) => titleLower.includes(w))) {
    return "engineering-qa";
  }
  // Generic software/engineer/developer -> fullstack (if not data/ml/ai)
  if (
    ["software", "engineer", "developer"].some((w) => titleLower.includes(w)) &&
    !["data", "ml", "ai"].some((w) => titleLower.includes(w))
  ) {
    return "engineering-fullstack";
  }

  // Product categories
  if (["product manager", "product lead", "pm ", "product owner"].some((w) => titleLower.includes(w))) {
    return "product-management";
  }
  if (["product design", "ux ", "ui/ux", "user experience"].some((w) => titleLower.includes(w))) {
    return "product-design";
  }
  if (["user research", "ux research"].some((w) => titleLower.includes(w))) {
    return "product-research";
  }

  // Marketing categories
  if (["growth", "acquisition", "performance marketing"].some((w) => titleLower.includes(w))) {
    return "marketing-growth";
  }
  if (["product market", "pmm"].some((w) => titleLower.includes(w))) {
    return "marketing-product";
  }
  if (["content", "copywriter", "editorial"].some((w) => titleLower.includes(w))) {
    return "marketing-content";
  }
  if (["brand", "creative"].some((w) => titleLower.includes(w))) {
    return "marketing-brand";
  }
  if (titleLower.includes("marketing")) {
    return "marketing-growth";
  }

  // Go-to-Market categories
  if (["sales", "account executive", "business development", "bdm"].some((w) => titleLower.includes(w))) {
    return "sales";
  }
  if (["customer success", "csm"].some((w) => titleLower.includes(w))) {
    return "customer-success";
  }
  if (["support", "customer service"].some((w) => titleLower.includes(w))) {
    return "customer-support";
  }

  // Operations categories
  if (["operations", "ops "].some((w) => titleLower.includes(w))) {
    return "operations";
  }
  if (["finance", "accounting", "controller"].some((w) => titleLower.includes(w))) {
    return "finance";
  }
  if (["legal", "compliance", "regulatory"].some((w) => titleLower.includes(w))) {
    return "legal-compliance";
  }
  if (["hr ", "people", "recruiter", "talent"].some((w) => titleLower.includes(w))) {
    return "hr-people";
  }
  if (["analyst", "analytics", "data scientist", "bi "].some((w) => titleLower.includes(w))) {
    return "data-analytics";
  }
  if (["risk", "fraud"].some((w) => titleLower.includes(w))) {
    return "risk";
  }

  // Leadership
  if (["vp ", "director", "head of", "chief", "cto", "cfo", "ceo"].some((w) => titleLower.includes(w))) {
    return "leadership";
  }

  return "other";
}

/**
 * Get a human-readable label for a role category
 */
export function getCategoryLabel(category: RoleCategory): string {
  const labels: Record<RoleCategory, string> = {
    "engineering-backend": "Backend Engineering",
    "engineering-frontend": "Frontend Engineering",
    "engineering-fullstack": "Full Stack Engineering",
    "engineering-mobile": "Mobile Engineering",
    "engineering-data": "Data Engineering",
    "engineering-ml": "Machine Learning",
    "engineering-devops": "DevOps / SRE",
    "engineering-security": "Security Engineering",
    "engineering-qa": "QA / Testing",
    "product-management": "Product Management",
    "product-design": "Product Design",
    "product-research": "User Research",
    "marketing-growth": "Growth Marketing",
    "marketing-product": "Product Marketing",
    "marketing-content": "Content Marketing",
    "marketing-brand": "Brand Marketing",
    sales: "Sales",
    "customer-success": "Customer Success",
    "customer-support": "Customer Support",
    operations: "Operations",
    finance: "Finance",
    "legal-compliance": "Legal & Compliance",
    "hr-people": "HR / People",
    "data-analytics": "Data Analytics",
    risk: "Risk / Fraud",
    leadership: "Leadership",
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
 * Categorize jobs using stored function_category if available, fallback to title-based categorization
 */
export function categorizeJobs(jobs: Array<{ title: string; function_category?: string | null }>): FunctionStats[] {
  const counts = new Map<RoleCategory, number>();
  const total = jobs.length;

  for (const job of jobs) {
    // Use stored function_category if available, otherwise fallback to title-based categorization
    let category: RoleCategory;
    if (job.function_category && ROLE_CATEGORIES.includes(job.function_category as RoleCategory)) {
      category = job.function_category as RoleCategory;
    } else {
      // Fallback to title-based categorization for jobs without stored function_category
      category = quickCategorize(job.title);
    }
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
