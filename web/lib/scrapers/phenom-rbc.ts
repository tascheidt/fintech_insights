/**
 * RBC (Royal Bank of Canada) — Phenom CareerConnect scraper.
 *
 * Browser-based. Lives in scrape-heavy.yml's offload set (see
 * `isBrowserScraper` in `./index.ts`). Daily cadence is fine — fragility
 * budget is wide because we read from documented surfaces, not CSS.
 *
 * Two data surfaces, both server-rendered into the HTML:
 *
 *   1. Listing pages embed `phApp.eagerLoadRefineSearch.data.jobs[]` with
 *      ~40 fields per posting: title, reqId, city/state/country,
 *      multi_category (department), subCategory (team), postedDate,
 *      descriptionTeaser. Pagination via `?from=<offset>`; default page
 *      size is 10, totalHits indicates the corpus size.
 *
 *   2. Detail pages embed a `<script type="application/ld+json">`
 *      JobPosting (schema.org) block with the full HTML description as
 *      `description` (HTML-entity-encoded). schema.org is documented and
 *      Google-indexed, so Phenom is unlikely to drop it. Phenom's own
 *      `phApp.ddo.jobDetail.data.job.description` is a structurally
 *      equivalent fallback.
 *
 * The scraper paginates the FULL listing first (cheap — one page-load
 * per 10 jobs), then enriches every posting's description with a per-job
 * detail-page fetch. Description enrichment runs in batches of
 * `ENRICH_BATCH_SIZE` (50): each batch uses concurrency=4 with fresh
 * puppeteer pages that are closed when the batch finishes, so page
 * memory doesn't accumulate across a multi-thousand-job run. Progress is
 * logged per batch.
 *
 * Cost knob: `PHENOM_RBC_MAX_JOBS` env var is an OPTIONAL cap. Unset (the
 * production default) means "process the entire RBC corpus" — pagination
 * runs until totalHits is exhausted. Set it for smoke tests or to impose
 * a cost ceiling. Full RBC is ~1,500 jobs; at 4-concurrent description
 * fetches × ~5s each that's ~30min on cold-start (fine for GitHub
 * Actions). The processor's `description_hash` gate makes subsequent
 * runs cheap (no Gemini re-extraction on unchanged jobs), but the
 * per-page Puppeteer load is still incurred — that's the next
 * optimization frontier if cost becomes real.
 */

import type { JobData } from "./types";
import type { Browser, Page } from "puppeteer-core";
import { decodeHtmlEntities, detectLocationType, htmlToText } from "./utils";
import { log } from "@/lib/log";

const RBC_LISTING_URL = "https://jobs.rbc.com/ca/en/search-results";
const DESCRIPTION_CONCURRENCY = 4;
// Description enrichment is processed in batches of this size: fresh
// puppeteer pages per batch, closed at batch end. Bounds page-memory
// growth over a full ~1,500-job corpus and gives per-batch progress logs.
const ENRICH_BATCH_SIZE = 50;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

// `decodeHtmlEntities` moved to `./utils` so the four scrapers that need it
// (phenom-rbc, scotiabank, workday-td, workday-cibc) share one definition.
// Re-exported here for the existing test + any external imports.
export { decodeHtmlEntities } from "./utils";

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
export function mapPhenomJob(raw: PhenomRawJob): JobData {
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
    ? `https://jobs.rbc.com/ca/en/job/${externalId}/${slug}`
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
      var candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (var c = 0; c < candidates.length; c++) {
        var entry = candidates[c];
        if (entry && entry["@type"] === "JobPosting" && typeof entry.description === "string" && entry.description.length > 200) {
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
  // Match the loader in `./browser.ts`. We don't reach into that module
  // directly because we want to manage our own pages/lifecycle.
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
  const url = from === 0 ? RBC_LISTING_URL : `${RBC_LISTING_URL}?from=${from}`;
  await page.goto(url, { waitUntil: "networkidle2", timeout: 45_000 });
  // Phenom hydrates after initial paint — small wait gives the SSR blob
  // time to settle on slow connections.
  await new Promise((r) => setTimeout(r, 2_000));
  const html = await page.content();
  return extractEagerLoadPayload(html);
}

async function enrichOne(page: Page, job: JobData): Promise<void> {
  if (!job.url) return;
  await page.goto(job.url, { waitUntil: "networkidle2", timeout: 45_000 });
  await new Promise((r) => setTimeout(r, 2_500));
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
            await enrichOne(page, job);
            enriched++;
          } catch (e) {
            failed++;
            log.warn(
              {
                reqId: job.external_id,
                err: e instanceof Error ? e.message : String(e),
              },
              "[phenom-rbc] description enrichment failed"
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
 * is logged after each so a long (~1,500-job) run is observable and a
 * crash leaves a clear high-water mark in the logs.
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
      "[phenom-rbc] enrichment batch complete"
    );
  }
  log.info(
    { enriched: totalEnriched, failed: totalFailed, total: jobs.length },
    "[phenom-rbc] description enrichment complete"
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Resolve the optional per-run cap. `PHENOM_RBC_MAX_JOBS`:
 *   - unset (production default) → null → process the entire corpus
 *   - a positive integer → cap the run to that many jobs (smoke tests,
 *     cost ceilings)
 * Exported for unit testing.
 */
export function resolveJobCap(
  rawEnv: string | undefined = process.env.PHENOM_RBC_MAX_JOBS
): number | null {
  if (rawEnv && /^\d+$/.test(rawEnv)) {
    return Math.max(1, parseInt(rawEnv, 10));
  }
  return null;
}

export async function fetchPhenomRbcJobs(
  atsIdentifier: string,
  browser?: Browser
): Promise<JobData[]> {
  // `atsIdentifier` is "rbc" today — accepted in the signature so the
  // factory can dispatch by tenant once more Phenom tenants land.
  void atsIdentifier;

  const cap = resolveJobCap();

  const { browser: browserInstance, owned } = await acquireBrowser(browser);

  try {
    const listingPage = await browserInstance.newPage();
    await listingPage.setUserAgent(USER_AGENT);

    const jobs: JobData[] = [];
    let totalHits: number | null = null;
    let from = 0;

    // Paginate the FULL listing. Phenom serves 10 per page. Stop when the
    // corpus is exhausted, a page comes back empty, or the optional cap
    // is reached.
    while (true) {
      const payload = await fetchListingPage(listingPage, from);
      if (!payload?.data?.jobs?.length) break;
      totalHits = payload.totalHits ?? totalHits;
      jobs.push(...payload.data.jobs.map(mapPhenomJob));
      from += payload.data.jobs.length;
      if (cap != null && jobs.length >= cap) break;
      if (totalHits != null && from >= totalHits) break;
    }

    if (cap != null && jobs.length > cap) jobs.length = cap;
    await listingPage.close();

    log.info(
      {
        fetched: jobs.length,
        totalHits,
        cap: cap ?? "uncapped",
        batchSize: ENRICH_BATCH_SIZE,
      },
      "[phenom-rbc] listings complete; enriching descriptions in batches"
    );

    if (jobs.length > 0) {
      await enrichDescriptions(
        browserInstance,
        jobs,
        DESCRIPTION_CONCURRENCY,
        ENRICH_BATCH_SIZE
      );
    }

    return jobs;
  } finally {
    if (owned) await browserInstance.close();
  }
}
