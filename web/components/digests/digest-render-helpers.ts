/**
 * Shared data-shaping helpers for the weekly-digest renderers.
 *
 * Both surfaces — the in-app `DigestViewer` (Tailwind + Next `<Link>`) and the
 * email `WeeklyDigestEmail` (`@react-email/components` + absolute URLs) —
 * consume the same `WeeklyDigest` payload but render with different React
 * primitive sets and different link semantics. Putting the JSX in one place
 * would force a render-prop abstraction; instead, we share the logic that
 * doesn't care about primitives:
 *
 *   - company-name → slug lookups
 *   - date-range / year-label formatting
 *   - leading-theme resolution
 *   - link target → href resolution (surface-aware)
 *   - per-section view-models (industry trend rows, strategy signal rows,
 *     company-section hrefs and continuity copy)
 *
 * Each renderer imports from here, then maps the resulting view-models onto
 * its own primitives. Keep this file primitive-free — no `react`, no
 * `next/link`, no `@react-email/components` imports.
 */
import type {
  CompanyWeeklySummary,
  IncumbentWatchBank,
  IndustryTrend,
  StrategySignal,
  WeeklyDigest,
} from "@/lib/analysis/digest";
import { buildDigestLink } from "@/lib/email/links";
import { getThemeIdByLabel } from "@/lib/analysis/role-themes";

export type DigestSurface = "app" | "email";

export interface SurfaceContext {
  digestId: string;
  surface: DigestSurface;
  appUrl?: string;
}

/** Resolve a company display name back to its slug via the digest payload. */
export function findCompanySlug(
  companies: CompanyWeeklySummary[],
  companyName: string
): string | null {
  const match = companies.find((entry) => entry.company_name === companyName);
  return match?.company_slug ?? null;
}

/** Format a `${weekStart} - ${weekEnd}, YYYY` range for display. */
export function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${startDate.toLocaleDateString("en-US", options)} - ${endDate.toLocaleDateString("en-US", options)}, ${endDate.getFullYear()}`;
}

/** First weekly role theme label, or "Various roles". */
export function getLeadingTheme(company: CompanyWeeklySummary): string {
  return company.hiring_pattern.weekly_role_themes[0]?.label || "Various roles";
}

/** First weekly role theme id, or null when no themes. */
export function getLeadingThemeId(company: CompanyWeeklySummary): string | null {
  return company.hiring_pattern.weekly_role_themes[0]?.id ?? null;
}

/** Year-start ISO date pinned to the digest's week_end year. */
export function getYearStartIso(weekEnd: string): string {
  return `${new Date(weekEnd).getUTCFullYear()}-01-01`;
}

/** "YYYY" label for the digest's week_end year. */
export function getYearLabel(weekEnd: string): string {
  return getYearStartIso(weekEnd).slice(0, 4);
}

/**
 * Surface-aware wrapper around `buildDigestLink`. Keeps the rendering code
 * out of the link-shape weeds — callers just say "I want the company page"
 * and the helper threads `surface` + `appUrl` through.
 */
export function makeLinkBuilder(ctx: SurfaceContext) {
  return (target: Parameters<typeof buildDigestLink>[0]["target"]): string =>
    buildDigestLink({
      surface: ctx.surface,
      digestId: ctx.digestId,
      ...(ctx.surface === "email" && ctx.appUrl ? { appUrl: ctx.appUrl } : {}),
      target,
    });
}

/** Top-level digest hrefs that don't depend on a per-row context. */
export interface DigestTopLinks {
  digest: string;
  jobsInDigest: string;
  companies: string;
  releases: string;
}

export function buildDigestTopLinks(ctx: SurfaceContext): DigestTopLinks {
  const link = makeLinkBuilder(ctx);
  return {
    digest: link({ kind: "digest" }),
    jobsInDigest: link({ kind: "jobs", inDigest: true }),
    companies: link({ kind: "companies" }),
    releases: link({ kind: "releases" }),
  };
}

// ---------------------------------------------------------------------------
// Industry trends
// ---------------------------------------------------------------------------

/** Per-company badge inside an industry-trend row. */
export interface TrendCompanyBadge {
  companyName: string;
  /** null when the company isn't in the digest companies list (no link). */
  slug: string | null;
  /** null when slug is null. */
  href: string | null;
}

/** A single row of the "Role Focus This Week" table. */
export interface TrendRow {
  trend: IndustryTrend;
  themeId: string | null;
  /** null when themeId is null (no link on the trend label itself). */
  href: string | null;
  companies: TrendCompanyBadge[];
}

export function buildIndustryTrendRows(
  digest: WeeklyDigest,
  ctx: SurfaceContext
): TrendRow[] {
  const link = makeLinkBuilder(ctx);
  return (digest.industry_trends || []).map((trend) => {
    const themeId = getThemeIdByLabel(trend.trend);
    const href = themeId
      ? link({ kind: "jobs", theme: themeId, inDigest: true })
      : null;
    const companies: TrendCompanyBadge[] = trend.companies.map(
      (companyName) => {
        const slug = findCompanySlug(digest.companies, companyName);
        if (!slug) {
          return { companyName, slug: null, href: null };
        }
        return {
          companyName,
          slug,
          href: link({
            kind: "jobs",
            company: slug,
            ...(themeId ? { theme: themeId } : {}),
            inDigest: true,
          }),
        };
      }
    );
    return { trend, themeId, href, companies };
  });
}

// ---------------------------------------------------------------------------
// Strategy signals
// ---------------------------------------------------------------------------

/** A single "New This Week" strategy-signal row. */
export interface StrategySignalRow {
  signal: StrategySignal;
  /** null when the signal's company isn't in the digest. */
  companyHref: string | null;
  /** null when the signal's company isn't in the digest. */
  signalHref: string | null;
}

export function buildStrategySignalRows(
  digest: WeeklyDigest,
  ctx: SurfaceContext
): StrategySignalRow[] {
  const link = makeLinkBuilder(ctx);
  return (digest.strategy_signals || []).map((signal) => {
    const slug = findCompanySlug(digest.companies, signal.company);
    if (!slug) {
      return { signal, companyHref: null, signalHref: null };
    }
    return {
      signal,
      companyHref: link({ kind: "company", slug }),
      signalHref: link({ kind: "jobs", company: slug, inDigest: true }),
    };
  });
}

// ---------------------------------------------------------------------------
// Company sections
// ---------------------------------------------------------------------------

/** Inline "New this week: X, Y, Z." segment for a company section. */
export interface NewThemeChip {
  label: string;
  /** null when no theme id resolves — render as plain text. */
  href: string | null;
  /** "," for non-final entries, "." for the last entry. */
  separator: string;
}

/** Per-company view-model for the "Company Highlights" section. */
export interface CompanySectionView {
  company: CompanyWeeklySummary;
  primaryFocus: string;
  primaryFocusThemeId: string | null;
  isContinuing: boolean;
  hasNewThemes: boolean;
  newThemes: NewThemeChip[];
  /** Hrefs for every link inside the company section. */
  links: {
    company: string;
    newJobs: string;
    yearTotal: string;
    /** null when there's no leading theme to focus on. */
    focus: string | null;
  };
}

export function buildCompanySectionView(
  company: CompanyWeeklySummary,
  yearStartIso: string,
  ctx: SurfaceContext
): CompanySectionView {
  const link = makeLinkBuilder(ctx);
  const slug = company.company_slug;
  const primaryFocus = getLeadingTheme(company);
  const primaryFocusThemeId = getLeadingThemeId(company);
  const isContinuing = company.hiring_pattern.continuity === "continuing";
  const newThemeLabels = company.hiring_pattern.new_themes;
  const hasNewThemes = newThemeLabels.length > 0;

  const newThemes: NewThemeChip[] = newThemeLabels.map((label, idx) => {
    const themeId = getThemeIdByLabel(label);
    const separator = idx < newThemeLabels.length - 1 ? ", " : ".";
    if (!themeId) {
      return { label, href: null, separator };
    }
    return {
      label,
      href: link({
        kind: "jobs",
        company: slug,
        theme: themeId,
        inDigest: true,
      }),
      separator,
    };
  });

  return {
    company,
    primaryFocus,
    primaryFocusThemeId,
    isContinuing,
    hasNewThemes,
    newThemes,
    links: {
      company: link({ kind: "company", slug }),
      newJobs: link({ kind: "jobs", company: slug, inDigest: true }),
      yearTotal: link({
        kind: "jobs",
        company: slug,
        from: yearStartIso,
      }),
      focus: primaryFocusThemeId
        ? link({
            kind: "jobs",
            company: slug,
            theme: primaryFocusThemeId,
            inDigest: true,
          })
        : null,
    },
  };
}

export function buildCompanySectionViews(
  digest: WeeklyDigest,
  ctx: SurfaceContext
): CompanySectionView[] {
  const yearStartIso = getYearStartIso(digest.week_end);
  return digest.companies.map((company) =>
    buildCompanySectionView(company, yearStartIso, ctx)
  );
}

// ---------------------------------------------------------------------------
// Incumbent Watch
// ---------------------------------------------------------------------------

/** Hard cap on per-bank bullets in the Incumbent Watch block (Surface 3). */
const INCUMBENT_WATCH_MAX_BANKS = 5;

/**
 * One per-bank row of the "Incumbent Watch" digest block. `head` is the
 * always-present structured bullet ("RBC · 3 senior AI/ML & Data roles");
 * `interpretation` is the AI prose line, null when the Flash call failed
 * (the structured fallback — the row still renders its head).
 */
export interface IncumbentWatchRow {
  bank: IncumbentWatchBank;
  head: string;
  /** AI interpretation line, or null — render head only when null. */
  interpretation: string | null;
}

/** The dashboard deep-link shown in the Incumbent Watch closing disclaimer. */
export interface IncumbentWatchView {
  rows: IncumbentWatchRow[];
  /** Href to the Incumbent Bets dashboard module. */
  dashboardHref: string;
}

/**
 * Shape the `incumbent_watch` payload into renderable rows. Returns null
 * when the block should be omitted entirely (no payload / no banks) — both
 * surfaces then drop the section and its surrounding dividers.
 */
export function buildIncumbentWatchView(
  digest: WeeklyDigest,
  ctx: SurfaceContext
): IncumbentWatchView | null {
  const watch = digest.incumbent_watch;
  if (!watch || watch.banks.length === 0) return null;

  const link = makeLinkBuilder(ctx);
  const rows: IncumbentWatchRow[] = watch.banks
    .slice(0, INCUMBENT_WATCH_MAX_BANKS)
    .map((bank) => ({
      bank,
      head: bank.head,
      interpretation: bank.interpretation,
    }));

  return {
    rows,
    dashboardHref: link({ kind: "dashboard" }),
  };
}
