/**
 * BNC (National Bank of Canada / Banque Nationale) — Avature CRM scraper.
 *
 * BNC runs Avature CRM white-labelled at `emplois.bnc.ca`. NOT Phenom
 * CareerConnect — the pages contain zero Phenom markers (no `phApp`, no
 * `eagerLoadRefineSearch`, no `__INITIAL_STATE__`). Everything is plain
 * server-rendered HTML.
 *
 * Browser-based via puppeteer-core + @sparticuz/chromium, offloaded to
 * `scrape-heavy.yml` (see `isBrowserScraper` in `./index.ts`). Pure-logic
 * parsing helpers (`parseListingPage`, `parseDetailPage`) operate on HTML
 * strings via DOMParser so they're unit-testable without a real browser.
 *
 * Two surfaces:
 *
 *   1. Listing pages (`/en_CA/careers/searchjobs?jobOffset=N`) render a
 *      simple <table> with one row per posting: Name, Location(s),
 *      Attendance. Each row has an anchor:
 *
 *        <a data-map="job-detail-link"
 *           href="https://emplois.bnc.ca/en_CA/careers/JobDetail/<slug>/<id>"
 *           title="Job title">Job title</a>
 *
 *      Total result count appears as the rendered string `1-20 of N
 *      result(s)`; regex pulls N out. Stride is 20 (server caps
 *      `jobRecordsPerPage` at 20).
 *
 *   2. Detail pages embed every job field as plain HTML inside one or more
 *      `<article class="article article--details ...">` blocks under the
 *      `.main-panel` container. There is no JSON-LD JobPosting block. We
 *      concatenate every `article__content__view__field__value` from those
 *      blocks (excluding the first metadata-only article that lists
 *      Attendance / Job number / Schedule / Posting date) and treat that
 *      as the canonical description HTML. Falls back to the largest
 *      single-article block if the heuristic returns nothing.
 *
 * Cost knob: `AVATURE_BNC_MAX_JOBS` env var is an OPTIONAL cap. Unset (the
 * production default) means "process the entire corpus" (~391 jobs as of
 * the rewrite). Set it for smoke tests or to impose a cost ceiling.
 *
 * Note on language: we use the `en_CA` URL even though BNC is bilingual.
 * The page titles render in mixed FR/EN (job titles are whatever the
 * recruiter typed), but the surrounding chrome — Category, Schedule,
 * "Area(s) of interest" labels — is cleaner in English, which the
 * downstream Flash extractor handles more reliably.
 */

import type { JobData } from "./types";
import type { Browser, Page } from "puppeteer-core";
import { detectLocationType, htmlToText } from "./utils";
import { log } from "@/lib/log";

const BNC_LISTING_URL = "https://emplois.bnc.ca/en_CA/careers/searchjobs";
const JOB_RECORDS_PER_PAGE = 20;
const DESCRIPTION_CONCURRENCY = 4;
// Description enrichment is processed in batches of this size: fresh
// puppeteer pages per batch, closed at batch end. Bounds page-memory
// growth and gives per-batch progress logs.
const ENRICH_BATCH_SIZE = 50;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Pure-logic helpers (testable without a browser; HTML-string in, data out)
// ---------------------------------------------------------------------------

/**
 * Minimal subset of the listing row we extract before mapping to JobData.
 * `attendance` is Avature's column header — values are "Hybrid", "On-Site",
 * or sometimes empty. It's not the same axis as our `commitment` field
 * (full-time/part-time/contract) — we map it to `location_type` instead.
 */
export interface AvatureRawJob {
  externalId: string;
  title: string;
  url: string;
  location: string | null;
  attendance: string | null;
}

/**
 * Resolve a DOM document from an HTML string. In a browser (page.evaluate)
 * or jsdom test environment `DOMParser` is on the global; in plain Node we
 * fall back to importing jsdom (a runtime dep). Exported so the parsing
 * helpers can be exercised in unit tests without a browser.
 */
function parseHtml(html: string): Document {
  // Prefer the native/jsdom-global DOMParser when available.
  const G = globalThis as unknown as {
    DOMParser?: { new (): { parseFromString(s: string, t: string): Document } };
  };
  if (G.DOMParser) {
    return new G.DOMParser().parseFromString(html, "text/html");
  }
  // Plain Node — load jsdom synchronously via require to avoid an async
  // signature on a pure function. `jsdom` is in package.json (already a
  // dependency of the test stack). No `@types/jsdom` is installed, so we
  // shape just the slice of the API we touch and cast.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jsdom = require("jsdom") as {
    JSDOM: new (s: string) => { window: { document: Document } };
  };
  return new jsdom.JSDOM(html).window.document;
}

/**
 * Extract the corpus size from the rendered listing chrome. Avature renders
 * the position string in two near-identical forms:
 *   - `aria-label="391 result(s)"` (most reliable — text not whitespace-sensitive)
 *   - `1-20 of 391` (visible text)
 * Try the aria-label first, fall back to the "of N" form. Returns null on
 * any failure so the pagination loop can fall back to walking until empty.
 */
export function extractTotalHits(html: string): number | null {
  // aria-label="<N> result(s)" — least fragile because it's in an attribute.
  const ariaMatch = html.match(/aria-label="(\d+)\s+result\(s\)"/i);
  if (ariaMatch) return parseInt(ariaMatch[1], 10);
  // Visible "X-Y of N" form — survives if aria-label disappears.
  const ofMatch = html.match(/of\s+(\d+)\b/);
  if (ofMatch) return parseInt(ofMatch[1], 10);
  return null;
}

/**
 * Parse a listing HTML chunk → raw rows. Walks every anchor with
 * `[data-map="job-detail-link"]` (Avature's stable hook), pulls the
 * adjacent <td>s as Location(s) and Attendance. Empty `external_id` is
 * filtered out so the caller never sees a row without a stable ID.
 */
export function parseListingPage(
  html: string
): { totalHits: number | null; jobs: AvatureRawJob[] } {
  const doc = parseHtml(html);
  const totalHits = extractTotalHits(html);
  const anchors = doc.querySelectorAll<HTMLAnchorElement>(
    'a[data-map="job-detail-link"]'
  );
  const jobs: AvatureRawJob[] = [];
  for (const a of Array.from(anchors)) {
    const href = a.getAttribute("href") || "";
    const externalId = extractExternalId(href);
    if (!externalId) continue;
    // Title: prefer the title attribute (cleaner, no whitespace), fall
    // back to text content.
    const title =
      (a.getAttribute("title") || a.textContent || "").trim() || "";
    // The anchor lives inside a `<th scope="row">`. The two sibling <td>s
    // on the same row are Location(s) and Attendance respectively.
    const row = a.closest("tr");
    const cells = row ? Array.from(row.querySelectorAll("td")) : [];
    const location = cells[0]
      ? cells[0].textContent?.trim().replace(/\s+/g, " ") || null
      : null;
    const attendance = cells[1]
      ? cells[1].textContent?.trim().replace(/\s+/g, " ") || null
      : null;
    jobs.push({ externalId, title, url: href, location, attendance });
  }
  return { totalHits, jobs };
}

/**
 * Pull the trailing numeric segment from a JobDetail href:
 *   /en_CA/careers/JobDetail/<slug>/32032 → "32032"
 * Trailing slash tolerated. Non-numeric IDs (none observed in production)
 * are accepted too — Avature treats the segment as a string.
 */
export function extractExternalId(href: string): string {
  if (!href) return "";
  const match = href.match(/\/JobDetail\/[^/]+\/([^/?#]+)/i);
  return match ? match[1] : "";
}

/**
 * Map one raw Avature row → canonical JobData. Pure transformation; the
 * description fields are left null/empty for the enrichment pass to fill.
 *
 * Mapping decisions:
 *   - `commitment`: always "full-time" — Avature listings don't expose
 *     contract/intern/part-time on the listing page (it's on the detail
 *     `<strong>Schedule:</strong> Full-Time</strong>` block but parsing
 *     that here would mean a per-job HTTP hit during listing, defeating
 *     the cheap pagination). Downstream Flash extraction can refine.
 *   - `location_type`: derived from the Attendance column ("Hybrid" /
 *     "On-Site") first, then falls back to the `detectLocationType`
 *     heuristic over the location string.
 *   - `department` / `team`: not surfaced on the listing page; left null
 *     and the Flash extraction pass picks them up from the description.
 */
export function mapAvatureJob(raw: AvatureRawJob): JobData {
  let locationType: string | null = null;
  if (raw.attendance) {
    const a = raw.attendance.toLowerCase();
    if (/hybrid/.test(a)) locationType = "hybrid";
    else if (/remote/.test(a)) locationType = "remote";
    else if (/on[-\s]?site|onsite/.test(a)) locationType = "onsite";
  }
  if (!locationType) locationType = detectLocationType(raw.location || "", "");

  return {
    external_id: raw.externalId,
    title: raw.title,
    department: null,
    team: null,
    location: raw.location,
    location_type: locationType,
    description_html: null,
    description_text: null,
    commitment: "full-time",
    posted_date: null,
    url: raw.url,
  };
}

/**
 * Pull the description HTML out of a detail page. Strategy:
 *
 *   1. Find every `<article class="...article--details...">` inside the
 *      `.main-panel` container.
 *   2. Drop the first one if it's the metadata-only block (heuristic:
 *      contains "Job number" or "Posting date" labels and no `<p>` body).
 *   3. Concatenate the inner HTML of every remaining
 *      `article__content__view__field__value` — that's the actual body.
 *   4. If concatenation comes back empty, fall back to the largest single
 *      block by character count.
 *
 * Returns `null` when nothing usable is found — the caller leaves the
 * description fields null and the Flash extractor's description-hash gate
 * will refuse to run, which is the correct behaviour.
 */
export function parseDetailPage(html: string): { descriptionHtml: string | null } {
  const doc = parseHtml(html);
  // Scope to the main job panel so the page footer's "Why work at NB?"
  // articles can't pollute the description.
  const root =
    doc.querySelector("#main-panel") ||
    doc.querySelector(".main-panel") ||
    doc.body;
  if (!root) return { descriptionHtml: null };

  const articles = Array.from(
    root.querySelectorAll("article.article--details")
  );
  if (articles.length === 0) {
    // Fallback: any `article__content__view__field__value` anywhere in the
    // main panel — covers the case where Avature renames the article class.
    const anyFields = Array.from(
      root.querySelectorAll(".article__content__view__field__value")
    );
    const combined = anyFields
      .map((el) => (el.innerHTML || "").trim())
      .filter((s) => s.length > 0)
      .join("\n\n");
    return { descriptionHtml: combined || null };
  }

  const isMetadataBlock = (a: Element): boolean => {
    const text = (a.textContent || "").toLowerCase();
    // First article on a Relational Private Banker page contains a fixed
    // set of labels and no <p> tags. Two of those labels co-occurring is
    // a strong tell.
    const hasMetaLabel =
      /\bjob number\b/.test(text) &&
      (/\bposting date\b/.test(text) || /\bschedule\b/.test(text));
    const hasParagraph = !!a.querySelector("p");
    return hasMetaLabel && !hasParagraph;
  };

  const bodyArticles = articles.filter((a) => !isMetadataBlock(a));
  const parts: string[] = [];
  for (const article of bodyArticles) {
    const values = Array.from(
      article.querySelectorAll(".article__content__view__field__value")
    );
    for (const v of values) {
      const html = (v.innerHTML || "").trim();
      if (html.length > 0) parts.push(html);
    }
  }
  let combined = parts.join("\n\n").trim();

  // Last-ditch fallback: take the largest single article by char count.
  if (combined.length === 0) {
    let best = "";
    for (const a of articles) {
      const inner = (a.innerHTML || "").trim();
      if (inner.length > best.length) best = inner;
    }
    combined = best;
  }

  return { descriptionHtml: combined.length > 0 ? combined : null };
}

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
  jobOffset: number
): Promise<{ totalHits: number | null; jobs: AvatureRawJob[] }> {
  const url =
    jobOffset === 0
      ? BNC_LISTING_URL
      : `${BNC_LISTING_URL}?jobOffset=${jobOffset}`;
  await page.goto(url, { waitUntil: "networkidle2", timeout: 45_000 });
  // Avature renders server-side, so a tiny wait is more about settling
  // late layout shifts than waiting on JS hydration.
  await new Promise((r) => setTimeout(r, 1_000));
  const html = await page.content();
  return parseListingPage(html);
}

async function enrichOne(page: Page, job: JobData): Promise<void> {
  if (!job.url) return;
  await page.goto(job.url, { waitUntil: "networkidle2", timeout: 45_000 });
  await new Promise((r) => setTimeout(r, 1_500));
  const html = await page.content();
  const { descriptionHtml } = parseDetailPage(html);
  if (!descriptionHtml) return;
  job.description_html = descriptionHtml;
  job.description_text = htmlToText(descriptionHtml);
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
                externalId: job.external_id,
                err: e instanceof Error ? e.message : String(e),
              },
              "[avature-bnc] description enrichment failed"
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
      "[avature-bnc] enrichment batch complete"
    );
  }
  log.info(
    { enriched: totalEnriched, failed: totalFailed, total: jobs.length },
    "[avature-bnc] description enrichment complete"
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Resolve the optional per-run cap. `AVATURE_BNC_MAX_JOBS`:
 *   - unset (production default) → null → process the entire corpus
 *   - a positive integer → cap the run to that many jobs (smoke tests,
 *     cost ceilings)
 * Exported for unit testing.
 */
export function resolveJobCap(
  rawEnv: string | undefined = process.env.AVATURE_BNC_MAX_JOBS
): number | null {
  if (rawEnv && /^\d+$/.test(rawEnv)) {
    return Math.max(1, parseInt(rawEnv, 10));
  }
  return null;
}

export async function fetchAvatureBncJobs(
  atsIdentifier: string,
  browser?: Browser
): Promise<JobData[]> {
  // `atsIdentifier` is "bnc" today — accepted in the signature so the
  // factory can dispatch by tenant once more Avature tenants land.
  void atsIdentifier;

  const cap = resolveJobCap();

  const { browser: browserInstance, owned } = await acquireBrowser(browser);

  try {
    const listingPage = await browserInstance.newPage();
    await listingPage.setUserAgent(USER_AGENT);

    const jobs: JobData[] = [];
    let totalHits: number | null = null;
    let jobOffset = 0;

    // Paginate the FULL listing. Avature caps `jobRecordsPerPage` at 20 —
    // jobOffset advances by exactly that. Stop when the corpus is
    // exhausted, a page comes back empty, or the optional cap is reached.
    while (true) {
      const { totalHits: pageTotal, jobs: pageJobs } = await fetchListingPage(
        listingPage,
        jobOffset
      );
      if (pageJobs.length === 0) break;
      totalHits = pageTotal ?? totalHits;
      jobs.push(...pageJobs.map(mapAvatureJob));
      jobOffset += JOB_RECORDS_PER_PAGE;
      if (cap != null && jobs.length >= cap) break;
      if (totalHits != null && jobOffset >= totalHits) break;
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
      "[avature-bnc] listings complete; enriching descriptions in batches"
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
