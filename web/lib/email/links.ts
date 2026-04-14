/**
 * Digest Link Builder — single source of truth for URLs that appear in
 * weekly digest emails and the in-app digest viewer.
 *
 * Every link the reader can click from a digest — in email or in app — is
 * constructed here. The same targets exist in both surfaces so a reader
 * sees the same affordances whether they're reading the email or browsing
 * the archived digest at `/digests/{id}`.
 *
 * Email calls get UTM parameters appended automatically; in-app calls
 * return clean relative paths. Both share the same path/query contract.
 *
 * Usage:
 *   // Email (absolute URL with UTM):
 *   buildDigestLink({ surface: "email", digestId, target: { kind: "company", slug: "wealthsimple" } })
 *   // In-app (relative path, no UTM):
 *   buildDigestLink({ surface: "app", digestId, target: { kind: "jobs", theme: "ai_ml_risk", company: "wealthsimple", inDigest: true } })
 */

export const DEFAULT_APP_URL = "https://fintech-talent-brief.vercel.app";

/** A jobs-list deep link — filters the /jobs page by theme/company/digest slice. */
export interface JobsLinkTarget {
  kind: "jobs";
  /** Role theme id from @/lib/analysis/role-themes (e.g. "ai_ml_risk"). */
  theme?: string;
  /** Company slug — matches companies.slug. */
  company?: string;
  /** When true, scope /jobs to the job ids captured in this digest's snapshot. */
  inDigest?: boolean;
  /** ISO date (inclusive) lower bound on first_seen_date. */
  from?: string;
  /** ISO date (inclusive) upper bound on first_seen_date. */
  to?: string;
}

/** A single-company detail page link (`/companies/[slug]`). */
export interface CompanyLinkTarget {
  kind: "company";
  slug: string;
}

/** The full digest detail page (`/digests/[id]`). */
export interface DigestLinkTarget {
  kind: "digest";
}

/** The all-companies list (`/companies`). */
export interface CompaniesIndexLinkTarget {
  kind: "companies";
}

/** The releases / changelog page. */
export interface ReleasesLinkTarget {
  kind: "releases";
}

export type DigestLinkKind =
  | JobsLinkTarget
  | CompanyLinkTarget
  | DigestLinkTarget
  | CompaniesIndexLinkTarget
  | ReleasesLinkTarget;

export interface BuildDigestLinkOptions {
  /** "email" = absolute URL + UTM; "app" = relative path, no UTM. */
  surface: "email" | "app";
  /** Digest id this link belongs to — used for the `inDigest` filter and UTM content tag. */
  digestId: string;
  /** Override the base origin for "email" surface (defaults to env/public URL). */
  appUrl?: string;
  target: DigestLinkKind;
}

/**
 * Resolve the base origin for absolute email links.
 */
export function getEmailBaseUrl(appUrl?: string): string {
  if (appUrl) return appUrl.replace(/\/$/, "");
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  return DEFAULT_APP_URL;
}

function buildJobsPath(target: JobsLinkTarget, digestId: string): string {
  const params = new URLSearchParams();
  if (target.theme) params.set("theme", target.theme);
  if (target.company) params.set("company", target.company);
  if (target.inDigest) params.set("inDigest", digestId);
  if (target.from) params.set("from", target.from);
  if (target.to) params.set("to", target.to);
  const query = params.toString();
  return query ? `/jobs?${query}` : "/jobs";
}

function resolvePath(target: DigestLinkKind, digestId: string): string {
  switch (target.kind) {
    case "jobs":
      return buildJobsPath(target, digestId);
    case "company":
      return `/companies/${target.slug}`;
    case "companies":
      return "/companies";
    case "digest":
      return `/digests/${digestId}`;
    case "releases":
      return "/releases";
  }
}

function appendUtm(path: string, digestId: string): string {
  const [pathname, search] = path.split("?", 2);
  const params = new URLSearchParams(search ?? "");
  params.set("utm_source", "digest");
  params.set("utm_medium", "email");
  params.set("utm_campaign", "weekly");
  params.set("utm_content", digestId);
  return `${pathname}?${params.toString()}`;
}

/**
 * Build a URL to a digest-relevant destination.
 *
 * Email surface returns absolute URLs with UTM params; app surface returns
 * clean relative paths for Next.js <Link> navigation.
 */
export function buildDigestLink(options: BuildDigestLinkOptions): string {
  const { surface, digestId, target, appUrl } = options;
  const path = resolvePath(target, digestId);

  if (surface === "app") {
    return path;
  }

  const base = getEmailBaseUrl(appUrl);
  return `${base}${appendUtm(path, digestId)}`;
}
