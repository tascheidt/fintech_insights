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
  adminOnly?: boolean;
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
  {
    slug: "prompt-forge",
    href: "/labs/prompt-forge",
    title: "Prompt Forge",
    status: "Beta",
    summary:
      "Tune extraction and synthesis prompts like a signal-hunting game, compare models, and ship winning configs live.",
    description:
      "Battle prompt variants against real company data, score them on specificity and insight depth, then save or promote the champion configuration.",
    ctaLabel: "Enter forge",
    featured: true,
    adminOnly: true,
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

export function getLabsExperiments(role?: string) {
  return labsExperiments.filter((experiment) => !experiment.adminOnly || role === "admin");
}

export function getLabsExperiment(slug: string, role?: string) {
  return getLabsExperiments(role).find((experiment) => experiment.slug === slug);
}
