/**
 * BMO (Bank of Montreal) — Phenom CareerConnect listing + Workday enrichment.
 *
 * BMO uses Phenom CareerConnect as its careers *frontend* (the search results
 * at jobs.bmo.com), but its actual job content lives in a **Workday** tenant
 * (`bmo.wd3.myworkdayjobs.com`) — every Phenom listing row's `applyUrl` routes
 * there. This is the load-bearing difference from RBC, which this scraper
 * originally mirrored: RBC server-renders the full JSON-LD `JobPosting` into
 * the Phenom detail HTML, so RBC enriches straight off that surface. BMO does
 * NOT reliably render that surface — the detail page mostly carries only a
 * ~290-char `descriptionTeaser`, so the JSON-LD/`jobDetail` extractor returned
 * null for ~99% of BMO postings and `description_html` was left empty corpus-
 * wide (June 2026 incident). Waiting longer (`networkidle2`) didn't help: the
 * description isn't on that surface to wait for.
 *
 * So BMO is enriched in two passes:
 *
 *   1. LISTING — Phenom `phApp.eagerLoadRefineSearch.data.jobs[]` (server-
 *      rendered into the initial HTML): ~40 fields per posting (title, reqId,
 *      city/state/country, multi_category → department, subCategory → team,
 *      postedDate, descriptionTeaser, AND `applyUrl` into Workday). Pagination
 *      via `?from=<offset>` at 10/page; `totalHits` is the corpus size. We
 *      keep Phenom for the listing because it carries richer taxonomy
 *      (department/team) than Workday's listing does.
 *
 *   2. DESCRIPTION ENRICHMENT — primary source is BMO's Workday CXS JSON
 *      endpoint (derived per-job from `applyUrl`; reliable HTTP fetch, no
 *      browser), the same surface that gives TD/CIBC 0 null descriptions. The
 *      Phenom JSON-LD detail page is kept as a per-job FALLBACK for anything
 *      Workday can't fill (missing apply URL, an Akamai block, or an empty
 *      body), navigated with a hydration-aware wait. See the scrapers
 *      CLAUDE.md for the BMO/Workday note.
 *
 * Lives in scrape-heavy.yml's offload set (browser-based via puppeteer for the
 * listing pass).
 *
 * Cost knob: `PHENOM_BMO_MAX_JOBS` env var is an OPTIONAL cap. Unset (the
 * production default) means "process the entire BMO corpus." Set it for
 * smoke tests or to impose a cost ceiling.
 */

import type { JobData } from "./types";
import type { Browser, Page } from "puppeteer-core";
import { decodeHtmlEntities, detectLocationType, htmlToText } from "./utils";
import {
  buildWorkdayHeaders,
  extractCookieJar,
  parseWorkdayJson,
  parseWorkdayJobDetail,
  WorkdayBlockedError,
  type WorkdayJobDetailResponse,
} from "./workday-utils";
import { log } from "@/lib/log";

const BMO_LISTING_URL = "https://jobs.bmo.com/ca/en/search-results";
const DESCRIPTION_CONCURRENCY = 4;
const ENRICH_BATCH_SIZE = 50;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// BMO's apply flow routes into a Workday tenant. Workday's CXS JSON endpoint
// (`/wday/cxs/<tenant>/<site>/job<externalPath>`) returns the full HTML job
// description reliably, so it is the PRIMARY description source for BMO. The
// listing applyUrl gives us the tenant/site/path per job; these constants are
// only used for the one warm-up POST that seeds the Akamai cookie.
const BMO_WORKDAY = { tenant: "bmo", instance: "wd3", site: "External" } as const;
const BMO_WORKDAY_LISTING_URL = `https://${BMO_WORKDAY.tenant}.${BMO_WORKDAY.instance}.myworkdayjobs.com/wday/cxs/${BMO_WORKDAY.tenant}/${BMO_WORKDAY.site}/jobs`;
const WORKDAY_FETCH_TIMEOUT_MS = 15_000;
const WORKDAY_ENRICH_CONCURRENCY = 6;

// ---------------------------------------------------------------------------
// Phenom listing JSON shape (subset)
// ---------------------------------------------------------------------------

export interface PhenomRawJob {
  reqId?: string;
  jobId?: string;
  title?: string;
  city?: string;
  state?: string;
  country?: string;
  multi_location?: string[];
  category?: string;
  multi_category?: string[];
  subCategory?: string;
  postedDate?: string;
  applyUrl?: string;
  jobUrl?: string;
  description?: string;
  descriptionTeaser?: string;
  ml_job_parser?: { descriptionTeaser?: string };
  remote?: boolean | string;
  hybrid?: boolean | string;
  type?: string;
}

export interface PhenomSearchPayload {
  totalHits?: number;
  hits?: number;
  data?: { jobs?: PhenomRawJob[] };
}

// ---------------------------------------------------------------------------
// Pure-logic helpers (testable without a browser)
// ---------------------------------------------------------------------------

/**
 * Walk the rendered HTML, find the `"eagerLoadRefineSearch":` marker, and
 * return the embedded JSON object via brace-counting. Null on any kind of
 * failure (marker not found, JSON malformed, etc.) — caller decides how
 * to react.
 */
export function extractEagerLoadPayload(
  html: string
): PhenomSearchPayload | null {
  const marker = '"eagerLoadRefineSearch":';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const objStart = html.indexOf("{", start + marker.length);
  if (objStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = objStart; i < html.length; i++) {
    const ch = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(
            html.substring(objStart, i + 1)
          ) as PhenomSearchPayload;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Map one Phenom row to the canonical `JobData` shape. Pure transformation
 * — no I/O, fully unit-testable.
 *
 * Phenom splits role taxonomy two ways:
 *   - `multi_category` (broad pipe-joined family) → `department`
 *   - `subCategory` (finer-grained) → `team`
 *
 * `description_text` is set to the listing-time teaser as a stand-in; the
 * description-enrichment pass replaces it with the full extracted text.
 */
export function mapBmoJob(raw: PhenomRawJob): JobData {
  const externalId = raw.reqId || raw.jobId || "";
  const locationParts = raw.multi_location?.length
    ? raw.multi_location.join("; ")
    : [raw.city, raw.state, raw.country].filter(Boolean).join(", ");
  const department = raw.multi_category?.[0] || raw.category || null;
  const team = raw.subCategory || null;
  const teaser =
    raw.descriptionTeaser ||
    raw.ml_job_parser?.descriptionTeaser ||
    raw.description ||
    null;

  let locationType: string | null = null;
  if (raw.remote === true || raw.remote === "true") locationType = "remote";
  else if (raw.hybrid === true || raw.hybrid === "true")
    locationType = "hybrid";
  else locationType = detectLocationType(locationParts, teaser || "");

  let postedDate: Date | null = null;
  if (raw.postedDate) {
    const parsed = new Date(raw.postedDate);
    if (!isNaN(parsed.getTime())) postedDate = parsed;
  }

  // Canonical Phenom URL — independent of whatever applyUrl Phenom rendered
  // (apply URLs route into Workday). Slug is title with non-alnum collapsed.
  const slug = (raw.title || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const url = externalId
    ? `https://jobs.bmo.com/ca/en/job/${externalId}/${slug}`
    : raw.jobUrl || raw.applyUrl || "";

  // Phenom occasionally encodes employment type as "Full time" / "Contract".
  let commitment: string = "full-time";
  if (raw.type) {
    const t = raw.type.toLowerCase();
    if (/contract/.test(t)) commitment = "contract";
    else if (/intern/.test(t)) commitment = "internship";
    else if (/part/.test(t)) commitment = "part-time";
  }

  return {
    external_id: externalId,
    title: raw.title || "",
    department,
    team,
    location: locationParts || null,
    location_type: locationType,
    description_html: null,
    description_text: teaser,
    commitment,
    posted_date: postedDate,
    url,
  };
}

/**
 * Derive the Workday CXS detail endpoint from a Phenom listing row's
 * `applyUrl`. BMO's Phenom listing routes every apply link into its Workday
 * tenant — e.g.
 *   https://bmo.wd3.myworkdayjobs.com/External/job/Toronto-Ontario-Canada/Senior-Machine-Learning-Engineer_R-2400512/apply
 * The Workday JSON detail endpoint for that posting is
 *   https://bmo.wd3.myworkdayjobs.com/wday/cxs/bmo/External/job/Toronto-Ontario-Canada/Senior-Machine-Learning-Engineer_R-2400512
 * i.e. inject `/wday/cxs/<tenant>` before the site segment and drop a trailing
 * `/apply`. The tenant and site are read from the URL (not hardcoded) so a
 * site rename (`External` → something else) still resolves. Returns null for
 * anything that isn't a Workday apply URL.
 *
 * Pure + exported for unit testing — the per-tenant Workday URL shape is
 * exactly the class of bug the scrapers CLAUDE.md says to pin in a test (the
 * May 2026 Workday `/job/job/` doubling shipped because no test covered it).
 */
export function deriveBmoWorkdayDetailUrl(
  applyUrl?: string | null
): string | null {
  if (!applyUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(applyUrl);
  } catch {
    return null;
  }
  if (!/\.myworkdayjobs\.com$/i.test(parsed.hostname)) return null;
  const tenant = parsed.hostname.split(".")[0];
  if (!tenant) return null;
  const segments = parsed.pathname.split("/").filter(Boolean);
  // Drop a trailing "apply" — the listing applyUrl ends in .../apply.
  if (segments[segments.length - 1]?.toLowerCase() === "apply") segments.pop();
  // Expect at least [site, "job", ...]; the path after the site is the
  // Workday `externalPath`, which must start with /job/.
  if (segments.length < 2) return null;
  const site = segments[0];
  const externalPath = "/" + segments.slice(1).join("/");
  if (!externalPath.startsWith("/job/")) return null;
  return `https://${parsed.hostname}/wday/cxs/${tenant}/${site}${externalPath}`;
}

// Re-exported for the existing test + any external imports.
export { decodeHtmlEntities } from "./utils";

// ---------------------------------------------------------------------------
// Browser-side extractor (string-sourced so tsx's `__name` helper can't
// leak into the page context — see smoke history).
// ---------------------------------------------------------------------------

export const PHENOM_DETAIL_EXTRACTOR_SRC = `(function () {
  // Strategy 1: JSON-LD JobPosting (schema.org). Documented + Google-
  // indexed, so most stable surface available.
  var ldNodes = document.querySelectorAll('script[type="application/ld+json"]');
  for (var i = 0; i < ldNodes.length; i++) {
    var raw = ldNodes[i].textContent || "";
    if (!raw) continue;
    try {
      var parsed = JSON.parse(raw);
      // JSON-LD arrives in three shapes: a bare object, a top-level array, or a
      // single object wrapping its nodes in @graph. Flatten all three before
      // looking for the JobPosting node. @type may itself be an array.
      var candidates = [];
      var roots = Array.isArray(parsed) ? parsed : [parsed];
      for (var r = 0; r < roots.length; r++) {
        var root = roots[r];
        if (!root) continue;
        candidates.push(root);
        if (root["@graph"] && Array.isArray(root["@graph"])) {
          for (var g = 0; g < root["@graph"].length; g++) candidates.push(root["@graph"][g]);
        }
      }
      for (var c = 0; c < candidates.length; c++) {
        var entry = candidates[c];
        if (!entry) continue;
        var t = entry["@type"];
        var isJobPosting = t === "JobPosting" || (Array.isArray(t) && t.indexOf("JobPosting") !== -1);
        if (isJobPosting && typeof entry.description === "string" && entry.description.length > 200) {
          return { html: entry.description, source: "json-ld-JobPosting" };
        }
      }
    } catch (e) {}
  }

  // Strategy 2: phApp.ddo.jobDetail.data.job.description (Phenom's
  // internal blob — backup in case schema.org disappears).
  var html = document.documentElement.innerHTML;
  var marker = '"jobDetail":';
  var start = html.indexOf(marker);
  if (start !== -1) {
    var objStart = html.indexOf("{", start + marker.length);
    if (objStart !== -1) {
      var depth = 0, inStr = false, esc = false;
      for (var p = objStart; p < html.length; p++) {
        var ch = html[p];
        if (esc) { esc = false; continue; }
        if (ch === '\\\\') { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            try {
              var obj = JSON.parse(html.substring(objStart, p + 1));
              var desc = obj && obj.data && obj.data.job && (obj.data.job.description || obj.data.job.descriptionHtml);
              if (desc && desc.length > 200) {
                return { html: desc, source: "phApp-jobDetail" };
              }
            } catch (e) {}
            break;
          }
        }
      }
    }
  }
  return null;
})()`;

// ---------------------------------------------------------------------------
// Puppeteer driver
// ---------------------------------------------------------------------------

interface BrowserHandles {
  browser: Browser;
  owned: boolean;
}

async function acquireBrowser(injected?: Browser): Promise<BrowserHandles> {
  if (injected) return { browser: injected, owned: false };
  const puppeteer = await import("puppeteer-core");
  const chromiumModule = await import("@sparticuz/chromium");
  type ChromiumLike = {
    args: string[];
    defaultViewport?: { width: number; height: number } | null;
    executablePath: () => Promise<string>;
  };
  const chromium = (
    (chromiumModule as { default?: ChromiumLike }).default ?? chromiumModule
  ) as unknown as ChromiumLike;
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.default.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: true,
  });
  return { browser, owned: true };
}

async function fetchListingPage(
  page: Page,
  from: number
): Promise<PhenomSearchPayload | null> {
  const url = from === 0 ? BMO_LISTING_URL : `${BMO_LISTING_URL}?from=${from}`;
  await page.goto(url, { waitUntil: "networkidle2", timeout: 45_000 });
  await new Promise((r) => setTimeout(r, 2_000));
  const html = await page.content();
  return extractEagerLoadPayload(html);
}

async function enrichOnePhenom(page: Page, job: JobData): Promise<void> {
  if (!job.url) return;
  // Phenom is the FALLBACK source (Workday is primary). Unlike RBC, BMO does
  // not reliably server-render the JSON-LD JobPosting into the initial HTML, so
  // we navigate with `domcontentloaded` and then POLL the extractor until the
  // description surface has hydrated (or an 8s budget elapses) rather than
  // waiting a fixed settle. On RBC-shaped pages where the surface is already
  // present this resolves immediately; on BMO pages that never expose it the
  // poll times out cheaply and we record a fallback miss.
  await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  try {
    await page.waitForFunction(`${PHENOM_DETAIL_EXTRACTOR_SRC} !== null`, {
      timeout: 8_000,
      polling: 500,
    });
  } catch {
    // Surface never appeared within budget — the evaluate below returns null.
  }
  const result = (await page.evaluate(PHENOM_DETAIL_EXTRACTOR_SRC)) as
    | { html: string; source: string }
    | null;
  if (!result?.html) return;
  const decoded = decodeHtmlEntities(result.html);
  job.description_html = decoded;
  job.description_text = htmlToText(decoded);
}

/**
 * Enrich one batch of jobs. Spins up `concurrency` fresh pages, drains a
 * shared queue, and closes the pages when done — so page memory is
 * released at the end of every batch rather than accumulating across the
 * whole corpus.
 */
async function enrichBatch(
  browser: Browser,
  batch: JobData[],
  concurrency: number
): Promise<{ enriched: number; failed: number }> {
  const queue = [...batch];
  let enriched = 0;
  let failed = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
      const page = await browser.newPage();
      try {
        await page.setUserAgent(USER_AGENT);
        while (queue.length > 0) {
          const job = queue.shift();
          if (!job) break;
          try {
            await enrichOnePhenom(page, job);
            enriched++;
          } catch (e) {
            failed++;
            log.warn(
              {
                reqId: job.external_id,
                err: e instanceof Error ? e.message : String(e),
              },
              "[phenom-bmo] phenom fallback enrichment failed"
            );
          }
        }
      } finally {
        await page.close();
      }
    })
  );
  return { enriched, failed };
}

/**
 * Enrich every job's description, walking the corpus in chunks of
 * `batchSize`. Each chunk is a self-contained `enrichBatch` call; progress
 * is logged after each so a long-running scrape is observable and a crash
 * leaves a clear high-water mark in the logs.
 */
async function enrichDescriptions(
  browser: Browser,
  jobs: JobData[],
  concurrency: number,
  batchSize: number
): Promise<void> {
  const batchCount = Math.ceil(jobs.length / batchSize);
  let totalEnriched = 0;
  let totalFailed = 0;
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batchNum = Math.floor(i / batchSize) + 1;
    const batch = jobs.slice(i, i + batchSize);
    const { enriched, failed } = await enrichBatch(browser, batch, concurrency);
    totalEnriched += enriched;
    totalFailed += failed;
    log.info(
      {
        batch: batchNum,
        batchCount,
        processed: Math.min(i + batchSize, jobs.length),
        total: jobs.length,
        enrichedSoFar: totalEnriched,
        failedSoFar: totalFailed,
      },
      "[phenom-bmo] phenom fallback batch complete"
    );
  }
  log.info(
    { enriched: totalEnriched, failed: totalFailed, total: jobs.length },
    "[phenom-bmo] phenom fallback enrichment complete"
  );
}

// ---------------------------------------------------------------------------
// Workday enrichment (primary description source)
// ---------------------------------------------------------------------------

/** One job paired with the Workday detail URL derived from its applyUrl. */
interface BmoEnrichTarget {
  job: JobData;
  workdayUrl: string | null;
}

/**
 * Best-effort warm-up: POST once to BMO's Workday listing endpoint to capture
 * the Akamai `_abck` cookie, which the per-job detail GETs then replay so they
 * look like the same browser session (mirrors the cookie continuity in the
 * workday-cibc / workday-td scrapers). Returns "" — and the detail GETs proceed
 * cookie-less — if the warm-up is blocked or errors; we never fail the run
 * here, because the Phenom JSON-LD fallback can still try.
 */
async function seedWorkdayCookie(
  headers: Record<string, string>
): Promise<string> {
  try {
    const res = await fetch(BMO_WORKDAY_LISTING_URL, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        limit: 1,
        offset: 0,
        searchText: "",
        appliedFacets: {},
      }),
      signal: AbortSignal.timeout(WORKDAY_FETCH_TIMEOUT_MS),
    });
    const jar = extractCookieJar(res);
    await res.text().catch(() => {}); // drain the body so the socket frees
    return jar;
  } catch {
    return "";
  }
}

/**
 * Enrich descriptions from BMO's Workday tenant — the PRIMARY source. For every
 * target with a derived Workday URL, GET the CXS detail JSON and fill
 * description_html/text (and location/posted_date if the listing lacked them).
 * Returns the targets it could NOT fill (no Workday URL, an Akamai block, a
 * non-2xx, or an empty body) so the caller can fall back to the Phenom detail
 * page. Never throws — a total Workday block degrades to the Phenom fallback
 * rather than discarding the already-fetched listing corpus.
 */
async function enrichViaWorkday(
  targets: BmoEnrichTarget[]
): Promise<{ enriched: number; remaining: BmoEnrichTarget[] }> {
  const headers = buildWorkdayHeaders(
    BMO_WORKDAY.tenant,
    BMO_WORKDAY.instance,
    BMO_WORKDAY.site
  );
  const cookieJar = await seedWorkdayCookie(headers);

  const queue = targets.filter((t) => t.workdayUrl);
  const withWorkdayUrl = queue.length;
  const remaining: BmoEnrichTarget[] = targets.filter((t) => !t.workdayUrl);
  let enriched = 0;
  let blocked = 0;

  await Promise.all(
    Array.from(
      { length: Math.min(WORKDAY_ENRICH_CONCURRENCY, queue.length) },
      async () => {
        while (queue.length > 0) {
          const target = queue.shift();
          if (!target?.workdayUrl) break;
          try {
            const res = await fetch(target.workdayUrl, {
              headers: {
                ...headers,
                ...(cookieJar ? { Cookie: cookieJar } : {}),
              },
              signal: AbortSignal.timeout(WORKDAY_FETCH_TIMEOUT_MS),
            });
            if (!res.ok) throw new Error(`status ${res.status}`);
            // Akamai can answer HTTP 200 with an HTML challenge body
            // (greylisted runner IP); parseWorkdayJson throws a typed
            // WorkdayBlockedError so the miss is legible in the logs.
            const detail = await parseWorkdayJson<WorkdayJobDetailResponse>(
              res,
              BMO_WORKDAY.tenant
            );
            const parsed = parseWorkdayJobDetail(detail);
            if (parsed.description_html && parsed.description_html.length > 200) {
              target.job.description_html = parsed.description_html;
              target.job.description_text =
                parsed.description_text || target.job.description_text;
              if (parsed.location && !target.job.location) {
                target.job.location = parsed.location;
              }
              if (parsed.posted_date && !target.job.posted_date) {
                target.job.posted_date = parsed.posted_date;
              }
              enriched++;
            } else {
              remaining.push(target);
            }
          } catch (e) {
            if (e instanceof WorkdayBlockedError) blocked++;
            remaining.push(target);
            log.warn(
              {
                reqId: target.job.external_id,
                err: e instanceof Error ? e.message : String(e),
              },
              "[phenom-bmo] workday description enrichment failed"
            );
          }
        }
      }
    )
  );

  log.info(
    { enriched, remaining: remaining.length, blocked, withWorkdayUrl },
    "[phenom-bmo] workday enrichment pass complete"
  );
  return { enriched, remaining };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Resolve the optional per-run cap. `PHENOM_BMO_MAX_JOBS`:
 *   - unset (production default) → null → process the entire corpus
 *   - a positive integer → cap the run to that many jobs (smoke tests,
 *     cost ceilings)
 * Exported for unit testing.
 */
export function resolveJobCap(
  rawEnv: string | undefined = process.env.PHENOM_BMO_MAX_JOBS
): number | null {
  if (rawEnv && /^\d+$/.test(rawEnv)) {
    return Math.max(1, parseInt(rawEnv, 10));
  }
  return null;
}

export async function fetchPhenomBmoJobs(
  atsIdentifier: string,
  browser?: Browser
): Promise<JobData[]> {
  // `atsIdentifier` is "bmo" today — accepted so the factory can dispatch
  // by tenant once more Phenom tenants land.
  void atsIdentifier;

  const cap = resolveJobCap();

  const { browser: browserInstance, owned } = await acquireBrowser(browser);

  try {
    const listingPage = await browserInstance.newPage();
    await listingPage.setUserAgent(USER_AGENT);

    const targets: BmoEnrichTarget[] = [];
    let totalHits: number | null = null;
    let from = 0;

    // Paginate the FULL listing. Phenom serves 10 per page. Stop when the
    // corpus is exhausted, a page comes back empty, or the optional cap
    // is reached. Each row is paired with the Workday detail URL derived from
    // its applyUrl so the enrichment pass can hit Workday directly.
    while (true) {
      const payload = await fetchListingPage(listingPage, from);
      if (!payload?.data?.jobs?.length) break;
      totalHits = payload.totalHits ?? totalHits;
      for (const raw of payload.data.jobs) {
        targets.push({
          job: mapBmoJob(raw),
          workdayUrl: deriveBmoWorkdayDetailUrl(raw.applyUrl),
        });
      }
      from += payload.data.jobs.length;
      if (cap != null && targets.length >= cap) break;
      if (totalHits != null && from >= totalHits) break;
    }

    if (cap != null && targets.length > cap) targets.length = cap;
    await listingPage.close();

    log.info(
      {
        fetched: targets.length,
        totalHits,
        withWorkdayUrl: targets.filter((t) => t.workdayUrl).length,
        cap: cap ?? "uncapped",
      },
      "[phenom-bmo] listings complete; enriching via Workday (Phenom fallback)"
    );

    if (targets.length > 0) {
      // Pass 1 — Workday CXS JSON (primary): reliable, HTTP, no browser.
      const { enriched, remaining } = await enrichViaWorkday(targets);

      // Pass 2 — Phenom JSON-LD detail page (fallback) for anything Workday
      // could not fill (no apply URL, an Akamai block, or an empty body).
      if (remaining.length > 0) {
        log.info(
          { workdayEnriched: enriched, fallbackCount: remaining.length },
          "[phenom-bmo] running Phenom JSON-LD fallback for residual jobs"
        );
        await enrichDescriptions(
          browserInstance,
          remaining.map((t) => t.job),
          DESCRIPTION_CONCURRENCY,
          ENRICH_BATCH_SIZE
        );
      }
    }

    return targets.map((t) => t.job);
  } finally {
    if (owned) await browserInstance.close();
  }
}
