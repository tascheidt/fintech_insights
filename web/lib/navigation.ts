export interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}

export interface LabsExperiment {
  slug: string;
  href: string;
  title: string;
  status: "Experimental" | "Beta";
  summary: string;
  description: string;
  ctaLabel: string;
  featured?: boolean;
}

const PRIMARY_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/jobs", label: "Jobs" },
  { href: "/companies", label: "Companies" },
  { href: "/digests", label: "Weekly Digests" },
];

const UTILITY_NAV_ITEMS: NavItem[] = [
  { href: "/labs", label: "Labs" },
];

export const labsExperiments: LabsExperiment[] = [
  {
    slug: "strategy",
    href: "/labs/strategy",
    title: "Strategy Inference",
    status: "Experimental",
    summary:
      "Infer company initiatives from hiring patterns, then explore the timeline, role clusters, and evidence behind them.",
    description:
      "Analyze the last 12 months of job postings for a company and map them into likely strategic initiatives, confidence levels, and time horizons.",
    ctaLabel: "Open experiment",
    featured: true,
  },
];

export function getPrimaryNavItems(role?: string): NavItem[] {
  if (role === "admin") {
    return [...PRIMARY_NAV_ITEMS, { href: "/admin", label: "Admin" }];
  }

  return PRIMARY_NAV_ITEMS;
}

export function getUtilityNavItems(): NavItem[] {
  return UTILITY_NAV_ITEMS;
}

export function getLabsExperiment(slug: string) {
  return labsExperiments.find((experiment) => experiment.slug === slug);
}
