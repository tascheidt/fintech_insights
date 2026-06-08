/**
 * Workday-family shared helpers.
 *
 * Workday tenants expose a documented JSON API (`/wday/cxs/...`) — no
 * Puppeteer needed. Two endpoints per tenant:
 *
 *   1. Listing (POST `.../jobs`) — paginated by `offset` += 20, returns
 *      `{ total, jobPostings: [{ title, externalPath, locationsText,
 *      postedOn, bulletFields }] }`.
 *
 *   2. Detail (GET `.../job<externalPath>`) — returns
 *      `{ jobPostingInfo: { jobDescription /* HTML *\/, location, country,
 *      postedOn, jobReqId, ... } }`. `externalPath` already starts with `/`.
 *
 * Every Workday tenant in the corpus runs on the same surface, so the
 * three helpers below (URL builder + two pure mappers) are extracted up
 * front. Per Farhan's call ("guaranteed-shared, duplicating them is
 * future merge conflict") we do NOT extract a `WorkdayBaseScraper` class
 * — too premature with two tenants.
 */

import type { JobData } from "./types";
import { htmlToText, detectLocationType, normalizeCommitment } from "./utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One entry from the listing response's `jobPostings[]` array. */
export interface WorkdayListingRow {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
  // Some tenants surface additional optional metadata (brand, business
  // unit) inline. We keep the type open via `[k: string]: unknown` so
  // tenant-specific classifiers (e.g. Simplii) can probe without
  // re-typing the row.
  [key: string]: unknown;
}

export interface WorkdayListingResponse {
  total?: number;
  jobPostings?: WorkdayListingRow[];
}

export interface WorkdayJobDetailResponse {
  jobPostingInfo?: {
    jobDescription?: string;
    location?: string;
    country?: { descriptor?: string } | string;
    postedOn?: string;
    jobReqId?: string;
    title?: string;
    externalUrl?: string;
    timeType?: string;
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

/**
 * Build the listing POST URL and the per-job detail GET URL builder for a
 * given Workday tenant. Pure — no HTTP.
 *
 * Workday returns `externalPath` already prefixed with `/job/...`, so the
 * detail URL builder appends it verbatim — DO NOT prepend an extra `/job`
 * or the call returns 406 from the Akamai edge (May 2026 incident).
 *
 * Example: `td` / `wd3` / `TD_Bank_Careers` with externalPath `/job/Toronto/X_R-1` →
 *   listingPostUrl = "https://td.wd3.myworkdayjobs.com/wday/cxs/td/TD_Bank_Careers/jobs"
 *   jobGetUrl      = "https://td.wd3.myworkdayjobs.com/wday/cxs/td/TD_Bank_Careers/job/Toronto/X_R-1"
 *   jobPublicUrl   = "https://td.wd3.myworkdayjobs.com/TD_Bank_Careers/job/Toronto/X_R-1"
 */
export function buildWorkdayUrls(
  tenant: string,
  instance: string,
  site: string
): {
  listingPostUrl: string;
  jobGetUrl: (externalPath: string) => string;
  jobPublicUrl: (externalPath: string) => string;
} {
  const base = `https://${tenant}.${instance}.myworkdayjobs.com`;
  const cxs = `${base}/wday/cxs/${tenant}/${site}`;
  return {
    listingPostUrl: `${cxs}/jobs`,
    jobGetUrl: (externalPath: string) => `${cxs}${externalPath}`,
    // Public-facing apply URL (the one we store on JobData.url).
    jobPublicUrl: (externalPath: string) => `${base}/${site}${externalPath}`,
  };
}

// ---------------------------------------------------------------------------
// Apply-URL → CXS endpoint parser (Phenom → Workday bridge)
// ---------------------------------------------------------------------------

/** CXS endpoints + tenant coordinates parsed from a Workday "apply" URL. */
export interface WorkdayApplyTarget {
  /** CXS JSON detail GET (full job description). */
  detailUrl: string;
  /** CXS JSON listing POST — used only to warm up the Akamai cookie. */
  listingUrl: string;
  tenant: string;
  instance: string; // e.g. "wd3"
  site: string; // e.g. "External"
}

/**
 * Parse a Workday "apply" URL — as surfaced by a Phenom listing row's
 * `applyUrl` — into its CXS endpoints + tenant coordinates. Tenant, instance,
 * and site are read from the URL (not hardcoded), so this resolves any
 * `<tenant>.<instance>.myworkdayjobs.com` tenant.
 *
 *   https://bmo.wd3.myworkdayjobs.com/External/job/<loc>/<Title>_<reqId>/apply
 *     → detailUrl:  https://bmo.wd3.myworkdayjobs.com/wday/cxs/bmo/External/job/<loc>/<Title>_<reqId>
 *       listingUrl: https://bmo.wd3.myworkdayjobs.com/wday/cxs/bmo/External/jobs
 *
 * The `/wday/cxs/<tenant>/<site>` prefix is injected before the `externalPath`
 * (the `/job/...` tail, with a trailing `/apply` dropped) — the same shape
 * `buildWorkdayUrls` produces for the first-party Workday tenants. Returns null
 * for anything that isn't a Workday apply URL. Pure — exported for unit testing
 * (the per-tenant URL shape is exactly the bug class the scrapers CLAUDE.md
 * says to pin in a test).
 */
export function parseWorkdayApplyUrl(
  applyUrl?: string | null
): WorkdayApplyTarget | null {
  if (!applyUrl) return null;
  let u: URL;
  try {
    u = new URL(applyUrl);
  } catch {
    return null;
  }
  const host = u.hostname;
  const m = host.match(/^([^.]+)\.([^.]+)\.myworkdayjobs\.com$/i);
  if (!m) return null;
  const tenant = m[1];
  const instance = m[2];
  const segments = u.pathname.split("/").filter(Boolean);
  // Drop a trailing "apply" — the listing applyUrl ends in .../apply.
  if (segments[segments.length - 1]?.toLowerCase() === "apply") segments.pop();
  // Expect at least [site, "job", ...]; the path after the site is the Workday
  // externalPath, which must start with /job/.
  if (segments.length < 2) return null;
  const site = segments[0];
  const externalPath = "/" + segments.slice(1).join("/");
  if (!externalPath.startsWith("/job/")) return null;
  const cxs = `https://${host}/wday/cxs/${tenant}/${site}`;
  return {
    detailUrl: `${cxs}${externalPath}`,
    listingUrl: `${cxs}/jobs`,
    tenant,
    instance,
    site,
  };
}

// ---------------------------------------------------------------------------
// Pure mappers
// ---------------------------------------------------------------------------

/**
 * Map one listing row to a `JobData` (without description — the detail
 * endpoint owns that and the result is merged downstream). Pure.
 *
 * `urlBuilder` is passed in so the same mapper works for every Workday
 * tenant.
 *
 * Returns `null` if the row is missing both `externalPath` and `title`
 * (nothing we can do with it).
 */
export function parseWorkdayListingRow(
  raw: WorkdayListingRow,
  urlBuilder: (externalPath: string) => string
): JobData | null {
  const title = raw.title?.trim() || "";
  const externalPath = raw.externalPath?.trim() || "";
  if (!title && !externalPath) return null;

  // `externalPath` is the canonical id we have access to at listing time.
  // Strip the leading `/job/<tenant>/` if present so the id is stable
  // across URL-format changes; fall back to the full path otherwise.
  // Example: "/job/MONTRAL/Senior-Engineer_R-12345" → "Senior-Engineer_R-12345"
  const externalId = externalPath
    ? externalPath.split("/").filter(Boolean).pop() || externalPath
    : "";

  const location = raw.locationsText?.trim() || null;

  let postedDate: Date | null = null;
  if (raw.postedOn) {
    // Workday emits a variety of strings here. ISO and "Posted Yesterday"
    // style both appear. We only parse ISO/Date-parseable values; relative
    // strings get dropped to null and the detail endpoint can fill in.
    const parsed = new Date(raw.postedOn);
    if (!isNaN(parsed.getTime())) postedDate = parsed;
  }

  // `bulletFields` is Workday's catch-all for unstructured metadata —
  // often holds the brand name (for CIBC → Simplii). We don't interpret
  // it here; tenant-specific classifiers do.
  const bullets = Array.isArray(raw.bulletFields) ? raw.bulletFields : [];

  let commitment: string | null = "full-time";
  const titleLower = title.toLowerCase();
  if (/intern/.test(titleLower)) commitment = "internship";
  else if (/contract/.test(titleLower)) commitment = "contract";
  else if (/part-time|part time/.test(titleLower)) commitment = "part-time";
  // Workday sometimes encodes employment type in bulletFields ("Regular",
  // "Temporary"). Try normalizeCommitment on each as a soft signal.
  for (const b of bullets) {
    if (typeof b !== "string") continue;
    const normalized = normalizeCommitment(b);
    if (normalized && /contract|part|intern/.test(normalized)) {
      commitment = normalized;
      break;
    }
  }

  return {
    external_id: externalId,
    title,
    department: null,
    team: null,
    location,
    location_type: location ? detectLocationType(location, "") : null,
    description_html: null,
    description_text: null,
    commitment,
    posted_date: postedDate,
    url: externalPath ? urlBuilder(externalPath) : null,
  };
}

/**
 * Map a Workday detail response to the fields the description-enrichment
 * step needs. Pure.
 *
 * `jobDescription` is HTML; we keep both the raw HTML and a text
 * conversion so downstream consumers (hash gate, AI extractor) can
 * choose.
 */
export function parseWorkdayJobDetail(raw: WorkdayJobDetailResponse): {
  description_html: string;
  description_text: string;
  location?: string;
  posted_date?: Date | null;
} {
  const info = raw.jobPostingInfo ?? {};
  const descriptionHtml = typeof info.jobDescription === "string" ? info.jobDescription : "";

  let location: string | undefined;
  if (typeof info.location === "string" && info.location.trim()) {
    location = info.location.trim();
  }

  let postedDate: Date | null | undefined;
  if (info.postedOn) {
    const parsed = new Date(info.postedOn);
    if (!isNaN(parsed.getTime())) postedDate = parsed;
  }

  return {
    description_html: descriptionHtml,
    description_text: htmlToText(descriptionHtml),
    location,
    posted_date: postedDate,
  };
}

// ---------------------------------------------------------------------------
// Request hygiene — browser-like headers + cookie replay
// ---------------------------------------------------------------------------

/**
 * Build the canonical browser-like header set every Workday request needs.
 * Workday tenants sit behind Akamai, whose content-negotiation rules return
 * **406 Not Acceptable** (not 403/429) when a bare `Accept: application/json`
 * arrives without a real User-Agent / Accept-Language / Referer. Adding
 * these to BOTH the listing POST and the detail GET makes both calls look
 * like the same browser session — which is also what we want for cookie
 * continuity (see `extractCookieJar`).
 */
export function buildWorkdayHeaders(
  tenant: string,
  instance: string,
  site: string
): Record<string, string> {
  void tenant;
  void instance;
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: `https://${tenant}.${instance}.myworkdayjobs.com/en-US/${site}`,
  };
}

/**
 * Capture Set-Cookie values from a Workday Response into a Cookie header
 * string the caller can replay on subsequent requests. Workday's `_abck`
 * (Akamai bot-cookie) is set by the first successful listing POST; replaying
 * it on every detail GET keeps the Akamai fingerprint stable for the run.
 *
 * Without this, every detail GET is a fresh "unfingerprinted" client and
 * Akamai disguises the block as 406 (content negotiation failure).
 */
export function extractCookieJar(response: Response): string {
  type SetCookieHeaders = Headers & { getSetCookie?: () => string[] };
  const headers = response.headers as SetCookieHeaders;
  const setCookies =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : (() => {
          const single = response.headers.get("set-cookie");
          if (!single) return [];
          // Best-effort split on `,` only when followed by a `<name>=`. This
          // is the standard heuristic — Date attributes contain commas too.
          return single.split(/,(?=\s*[A-Za-z0-9_!#$%&'*+\-.^`|~]+=)/);
        })();
  const pairs: string[] = [];
  for (const sc of setCookies) {
    const firstSemi = sc.indexOf(";");
    const pair = firstSemi === -1 ? sc.trim() : sc.slice(0, firstSemi).trim();
    if (pair && pair.includes("=")) pairs.push(pair);
  }
  return pairs.join("; ");
}

// ---------------------------------------------------------------------------
// Response parsing — Akamai HTML-block detection
// ---------------------------------------------------------------------------

/**
 * Thrown when a Workday endpoint hands back an HTML body where JSON was
 * expected.
 *
 * Workday tenants sit behind Akamai. When Akamai flags the client — most
 * often a greylisted datacenter egress IP, e.g. a GitHub Actions runner —
 * it serves its challenge/block page as **HTTP 200 with an HTML body**, not
 * a 4xx/5xx. A naive `await res.json()` then throws an opaque
 * `SyntaxError: Unexpected token '<'`, which masked the real cause for days
 * (the June 2026 CIBC/TD incident: both died on the first listing POST while
 * the same request returned clean JSON from a residential IP).
 *
 * This typed error makes the block legible at the failure site and in the
 * `job_run_tasks` row. The remedy for a *sustained* block is a fresh runner
 * IP (the daily cron, or the `scrape-heavy.yml` `scrape-retry` job), NOT
 * in-process retry on the same IP — the greylist holds for the whole run.
 *
 * This is a different failure from the May 2026 Workday `406`: that was a
 * URL-doubling bug fixed by correcting the URL (`curl` first), and it
 * returned a 4xx, not a 200-with-HTML. Don't conflate them.
 */
export class WorkdayBlockedError extends Error {
  constructor(
    public readonly tenant: string,
    public readonly bodySnippet: string
  ) {
    super(
      `Workday ${tenant}: Akamai returned an HTML challenge page (HTTP 200, non-JSON body) — runner IP is likely greylisted. Body starts: ${bodySnippet}`
    );
    this.name = "WorkdayBlockedError";
  }
}

/**
 * True when a response body is the Akamai HTML block page rather than JSON.
 * Pure — exported for unit testing.
 *
 * Detection is a leading-`<` body sniff rather than a `Content-Type` check:
 * Akamai's block page is reliably HTML-bodied but its `Content-Type` is not
 * dependable, while a genuine Workday JSON response always opens with `{` or
 * `[` (after any leading whitespace).
 */
export function isAkamaiHtmlBlock(body: string): boolean {
  return body.trimStart().startsWith("<");
}

/**
 * Read a Workday `Response` as JSON, detecting the Akamai HTML-block page
 * first. Throws `WorkdayBlockedError` on a block (so the failure is typed and
 * legible) and re-throws any other JSON parse error verbatim. Consumes the
 * response body.
 */
export async function parseWorkdayJson<T>(
  res: Response,
  tenant: string
): Promise<T> {
  const body = await res.text();
  if (isAkamaiHtmlBlock(body)) {
    throw new WorkdayBlockedError(tenant, body.trimStart().slice(0, 100));
  }
  return JSON.parse(body) as T;
}

// ---------------------------------------------------------------------------
// Job cap
// ---------------------------------------------------------------------------

/**
 * Resolve an optional per-run cap from an env var. Same semantics as
 * `resolveJobCap` in phenom-rbc.ts:
 *   - unset / non-numeric → null → process entire corpus
 *   - positive integer → cap (smoke tests, cost ceilings)
 *   - 0 → 1 (a zero cap is a useless run)
 *
 * Exported so workday-td/workday-cibc share one definition.
 */
export function resolveWorkdayJobCap(rawEnv: string | undefined): number | null {
  if (rawEnv && /^\d+$/.test(rawEnv)) {
    return Math.max(1, parseInt(rawEnv, 10));
  }
  return null;
}
