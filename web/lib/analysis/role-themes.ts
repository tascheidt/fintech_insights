/**
 * Role Themes — shared source of truth.
 *
 * Role themes are the coarse-grained "kinds of roles" we talk about in the
 * weekly digest (e.g. "Engineering", "Risk and fraud", "AI and machine
 * learning for risk"). They are derived at query time from a job's title and
 * standardized department — we do NOT persist theme IDs on job rows, so the
 * digest generator, the jobs list filter, and any other consumer must all
 * import from this module to stay consistent.
 *
 * Usage:
 *   import { classifyJob, getThemeLabel, ROLE_THEME_RULES } from "@/lib/analysis/role-themes";
 *   const themeIds = classifyJob(job.title, job.standardized_department);
 *   const label = getThemeLabel("ai_ml_risk"); // -> "AI and machine learning for risk"
 */

export const ROLE_THEME_RULES = [
  { id: "ai_ml_risk", label: "AI and machine learning for risk", keywords: ["machine learning", "ml ", " ai ", "artificial intelligence", "decision science", "model risk", "risk model", "credit model", "fraud model"] },
  { id: "quality_engineering", label: "Quality engineering", keywords: ["quality engineer", "qa engineer", "software development engineer in test", "sdet", "test automation", "qa automation"] },
  { id: "risk_fraud", label: "Risk and fraud", keywords: ["risk", "fraud", "credit", "collections", "restructuring", "underwriting", "special loans"] },
  { id: "lending_mortgage", label: "Lending and mortgage", keywords: ["mortgage", "lending", "underwriter", "loan", "servicing"] },
  { id: "sales", label: "Sales", keywords: ["sales", "business development", "account executive", "account manager", "relationship manager", "regional manager"] },
  { id: "in_person_sales", label: "In-person sales", keywords: ["mall", "kiosk", "retail", "field sales", "sales representative", "brand ambassador", "grocery", "outlet"] },
  { id: "operations", label: "Operations", keywords: ["operations", "fulfillment", "coordinator", "specialist", "analyst", "servicing"] },
  { id: "support", label: "Support and customer service", keywords: ["support", "customer service", "customer experience", "contact centre", "call centre", "service representative"] },
  { id: "engineering", label: "Engineering", keywords: ["engineer", "developer", "software", "platform", "backend", "frontend", "full stack", "full-stack", "devops", "sre"] },
  { id: "product_design", label: "Product and design", keywords: ["product manager", "product owner", "designer", "ux", "ui", "research"] },
  { id: "finance", label: "Finance", keywords: ["finance", "accounting", "controller", "treasury", "fp&a", "financial analyst"] },
  { id: "compliance_legal", label: "Compliance and legal", keywords: ["compliance", "legal", "aml", "kyc", "regulatory", "privacy"] },
  { id: "leadership", label: "Leadership", keywords: ["vp", "vice president", "director", "head of", "chief", "principal"] },
] as const;

export type RoleThemeId = (typeof ROLE_THEME_RULES)[number]["id"];

export interface RoleThemeSummary {
  id: string;
  label: string;
  count: number;
  sample_titles: string[];
}

const DEPARTMENT_THEME_MAP: Record<string, string> = {
  Engineering: "engineering",
  Sales: "sales",
  Product: "product_design",
  Operations: "operations",
  Finance: "finance",
  Support: "support",
  "Customer Success": "support",
  Legal: "compliance_legal",
};

const THEME_LABEL_INDEX: Record<string, string> = ROLE_THEME_RULES.reduce(
  (acc, rule) => {
    acc[rule.id] = rule.label;
    return acc;
  },
  {} as Record<string, string>
);

/**
 * Normalize a title string for keyword matching: lowercase, punctuation
 * replaced with spaces, and padded with a leading/trailing space so that
 * keyword tokens like " ai " match word boundaries without false positives.
 */
export function normalizeTitle(text: string): string {
  return ` ${text.toLowerCase().replace(/[^\w\s]/g, " ")} `.replace(/\s+/g, " ");
}

/**
 * Classify a job into up to 2 role themes based on title keyword scoring,
 * with department as a secondary signal. Returns theme IDs sorted by score.
 */
export function classifyJob(
  title: string,
  department?: string | null
): string[] {
  const normalized = normalizeTitle(title);
  const matches: string[] = ROLE_THEME_RULES.map((rule) => ({
    id: rule.id,
    score: rule.keywords.reduce(
      (total, keyword) => total + (normalized.includes(normalizeTitle(keyword)) ? 1 : 0),
      0
    ),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.id);

  const departmentTheme = department ? DEPARTMENT_THEME_MAP[department] : undefined;
  if (departmentTheme && !matches.includes(departmentTheme)) {
    matches.push(departmentTheme);
  }

  if (matches.length === 0 && departmentTheme) {
    return [departmentTheme];
  }

  return matches.slice(0, 2);
}

/**
 * Does this job match the given theme? Uses the same classification logic.
 */
export function jobMatchesTheme(
  themeId: string,
  title: string,
  department?: string | null
): boolean {
  return classifyJob(title, department).includes(themeId);
}

/**
 * Look up a theme's human label by ID. Returns the ID itself if unknown so
 * that callers never render a blank string.
 */
export function getThemeLabel(themeId: string): string {
  return THEME_LABEL_INDEX[themeId] ?? themeId;
}

/**
 * Reverse lookup: given a theme label (possibly as it appears in the digest
 * UI), find the theme ID. Used when wiring legacy label strings from
 * industry_trends back into filterable URLs.
 */
export function getThemeIdByLabel(label: string): string | null {
  const normalized = label.trim().toLowerCase();
  const match = ROLE_THEME_RULES.find(
    (rule) => rule.label.toLowerCase() === normalized
  );
  return match?.id ?? null;
}

/**
 * Aggregate theme counts over a collection of jobs. Returns the top 5 themes
 * sorted by count, each with up to 3 sample titles.
 */
export function aggregateRoleThemes(
  jobs: Array<{ title: string; standardized_department: string | null }>
): RoleThemeSummary[] {
  const themeMap = new Map<string, { count: number; titles: string[] }>();

  for (const job of jobs) {
    const themeIds = classifyJob(job.title, job.standardized_department);
    for (const themeId of themeIds) {
      const rule = ROLE_THEME_RULES.find((candidate) => candidate.id === themeId);
      if (!rule) continue;

      const current = themeMap.get(themeId) ?? { count: 0, titles: [] };
      current.count += 1;
      if (!current.titles.includes(job.title) && current.titles.length < 3) {
        current.titles.push(job.title);
      }
      themeMap.set(themeId, current);
    }
  }

  return Array.from(themeMap.entries())
    .map(([id, value]) => ({
      id,
      label: getThemeLabel(id),
      count: value.count,
      sample_titles: value.titles,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}
