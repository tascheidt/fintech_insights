/**
 * Revolut careers scraper — custom-built SPA at `revolut.com/careers/`.
 *
 * Not on any third-party ATS (probed Smartrecruiters / Lever / Greenhouse /
 * Workable — Revolut is fully custom, Next.js + Cloudflare anti-bot in
 * front). Browser-based via puppeteer-core + @sparticuz/chromium, offloaded
 * to `scrape-heavy.yml`.
 *
 * The listing page (`/en-US/careers/?city=<location>`) renders each matching
 * job as a stable anchor:
 *
 *   <a href="/en-US/careers/position/<slug>-<uuid>/" class="...">
 *     <span>
 *       <h2>Title</h2>
 *       <span>...<span>Remote: Canada</span></span>
 *     </span>
 *   </a>
 *
 * The UUID trailing the slug is the canonical external_id.
 *
 * Two hard-won facts about the markup (June 2026 — the scraper shipped broken
 * on both and quietly returned 0 jobs for weeks):
 *
 *   1. Job hrefs carry a LOCALE PREFIX (`/en-US/careers/position/…`). The
 *      original selector `a[href^="/careers/position/"]` (anchored `^=`)
 *      matched nothing. We now match on `*=` ("contains") so any locale
 *      prefix works; `extractExternalId` reads the trailing UUID regardless.
 *   2. The page server-renders the FULL set of anchors only for small filters.
 *      A small location like Canada (3 roles) emits all 3; large/unfiltered
 *      views emit just a ~6-item "Featured roles" subset and lazy-load the
 *      rest on scroll. We scrape a country filter (Canada), which stays small,
 *      so a single load captures everything — but `assertListingHealthy` warns
 *      if we ever parse fewer than the page's reported count (a Canada surge
 *      past the featured cap would need a scroll/pagination pass).
 *
 * An UNRECOGNISED `?city=` value is IGNORED by Revolut (it returns the full
 * board, not an empty state), so don't treat a bogus filter as "0 results".
 *
 * Because that server-side filter can silently stop narrowing, we DO NOT trust
 * it alone. Every parsed role is independently checked against `isCanadianLocation`
 * and anything not clearly in the Canadian market is dropped. If the filter is
 * ignored and the board renders only non-Canadian roles (June 8 2026 incident:
 * `?city=Canada` stopped narrowing and Revolut's global "Featured roles" — six
 * London/Dubai/Lisbon/Netherlands/UAE/Krakow/Tokyo jobs — ingested under
 * Revolut Canada), the scrape throws `RevolutScrapeError("filter-ignored")`
 * rather than ingest the wrong market or silently return zero. (This guard is
 * Canada-specific; a new Revolut-country tenant needs its own market matcher.)
 *
 * Description enrichment: after the listing parse, each job's detail page is
 * visited (sequentially, reusing the Cloudflare-cleared page so we don't
 * re-trigger the challenge) and its description extracted — JSON-LD
 * `JobPosting` first (server-rendered for Google Jobs), then the Next.js
 * `__NEXT_DATA__` blob, then a main-content fallback. This matters beyond the
 * description field itself: with a description present, the hot-path Flash
 * extractor (`processor.ts` → `extractAndUpdateStructure`, gated on a non-empty
 * description) runs and populates `function_category` / `seniority_level` /
 * `standardized_department` — without it the jobs ingest uncategorised and
 * fall out of the Competitive Matrix's function-group breakdown. Enrichment is
 * best-effort (per-job try/catch); a detail-page miss leaves that row's
 * description null but never fails the run.
 *
 * Cloudflare: a plain curl hits a "Just a quick security check" challenge
 * page (~873KB of Cloudflare-injected Inter font data). Puppeteer in a GH
 * Actions runner clears it because the IP/UA pair reads as residential
 * enough. Local dev runs may fail the challenge — that's expected; debug
 * against the workflow.
 *
 * A genuinely-empty result and a failed load look identical (both yield 0
 * anchors), so they USED to collapse into a silent "0 jobs, success".
 * `fetchRevolutJobs` now disambiguates via the page's own counters ("We have
 * N open positions" global header + "Search from N open positions" filtered
 * count): 0 parsed while the page reports N>0 (or the page never rendered its
 * counters at all) throws `RevolutScrapeError` so the task fails loudly and
 * `scrape-heavy.yml`'s `scrape-retry` re-runs on a fresh runner — mirroring
 * the Workday `WorkdayBlockedError` pattern.
 */

import type { JobData } from "./types";
import type { Browser, Page } from "puppeteer-core";
import { detectLocationType, htmlToText, decodeHtmlEntities } from "./utils";
import { log } from "@/lib/log";

const REVOLUT_ORIGIN = "https://www.revolut.com";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Pure-logic helpers (testable without a browser; HTML-string in, data out)
// ---------------------------------------------------------------------------

export interface RevolutRawJob {
  externalId: string;
  title: string;
  url: string;
  location: string | null;
}

function parseHtml(html: string): Document {
  const G = globalThis as unknown as {
    DOMParser?: { new (): { parseFromString(s: string, t: string): Document } };
  };
  if (G.DOMParser) {
    return new G.DOMParser().parseFromString(html, "text/html");
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jsdom = require("jsdom") as {
    JSDOM: new (s: string) => { window: { document: Document } };
  };
  return new jsdom.JSDOM(html).window.document;
}

/**
 * Extract the trailing UUID from a Revolut job href.
 *   /en-US/careers/position/head-of-risk-257ab149-12e7-4a84-bda0-1ab1a1d36760/
 *     → "257ab149-12e7-4a84-bda0-1ab1a1d36760"
 *
 * The UUID is the stable per-job identifier; the slug prefix can change if
 * Revolut renames the role, and the leading locale segment (`/en-US/`) is
 * irrelevant because we anchor on the trailing UUID. Trailing slash tolerated.
 * Returns "" when no UUID is found — caller filters those out.
 */
export function extractExternalId(href: string): string {
  if (!href) return "";
  const match = href.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i
  );
  return match ? match[1].toLowerCase() : "";
}

/**
 * Anchor selector for job links. `*=` ("contains"), NOT `^=` ("starts with"):
 * Revolut hrefs carry a locale prefix (`/en-US/careers/position/…`), so an
 * anchored match finds nothing. Exported so the Puppeteer `waitForSelector`
 * and the parser stay in lockstep — a drift between them is what shipped the
 * silent-zero bug.
 */
export const JOB_ANCHOR_SELECTOR = 'a[href*="/careers/position/"]';

/**
 * Parse the listing HTML → raw rows. Walks every anchor whose href contains
 * `/careers/position/` (locale-prefix-agnostic), pulls the `<h2>` for the
 * title and the deepest text node under the anchor for the location (Revolut
 * puts "Remote: Canada" / "London, UK" / etc. in a span sibling to the
 * location icon — we grab it by skipping any element with the icon class and
 * taking the last non-empty descendant text).
 */
export function parseListingPage(html: string): RevolutRawJob[] {
  const doc = parseHtml(html);
  const anchors = doc.querySelectorAll<HTMLAnchorElement>(JOB_ANCHOR_SELECTOR);

  const jobs: RevolutRawJob[] = [];
  const seen = new Set<string>();
  for (const a of Array.from(anchors)) {
    const href = a.getAttribute("href") || "";
    const externalId = extractExternalId(href);
    if (!externalId || seen.has(externalId)) continue;

    const titleEl = a.querySelector("h2, h3, h1");
    const title = (titleEl?.textContent || "").trim();
    if (!title) continue;

    // Location: pick the last meaningful text node under the anchor that
    // isn't the title itself. Revolut renders it as the deepest text in a
    // sibling span. Falling back to all-text-minus-title keeps it resilient
    // to wrapper changes.
    let location: string | null = null;
    const all = (a.textContent || "").replace(/\s+/g, " ").trim();
    if (all && title && all.startsWith(title)) {
      const rest = all.slice(title.length).trim();
      location = rest || null;
    }

    seen.add(externalId);
    jobs.push({
      externalId,
      title,
      url: new URL(href, REVOLUT_ORIGIN).toString(),
      location,
    });
  }

  return jobs;
}

/**
 * Map a raw row → canonical JobData. Description fields left null;
 * enrichment is deferred (see file header).
 *
 * Location-type heuristic: Revolut spells remote jobs as `Remote: <city>`.
 * Hybrid/On-site aren't surfaced on the listing — the Flash extractor will
 * refine from the description on the next pipeline pass.
 */
export function mapRevolutJob(raw: RevolutRawJob): JobData {
  const loc = (raw.location || "").toLowerCase();
  let locationType: string | null = null;
  if (/^remote\b|: remote/.test(loc) || /\bremote\b/.test(loc)) {
    locationType = "remote";
  } else {
    locationType = detectLocationType(raw.location || "", "");
  }

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

// ---------------------------------------------------------------------------
// Canadian-market guard (defense-in-depth against a silently-ignored ?city=)
// ---------------------------------------------------------------------------

/**
 * Canadian provinces/territories + the major, *unambiguously* Canadian cities.
 * Ambiguous tokens are deliberately excluded — "London" (UK), "Victoria",
 * "Hamilton" — so a London-UK role can never read as Canadian. Revolut tags its
 * Canada roles country-level ("Remote: Canada"), so the `canada(ian)?` token is
 * the workhorse; this list is the safety net for the rare role that names a
 * Canadian city without the country word.
 */
const CANADA_LOCATION_RE =
  /\b(canada|canadian|ontario|quebec|qu[eé]bec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|labrador|prince edward island|northwest territories|nunavut|yukon|toronto|vancouver|montr[eé]al|calgary|ottawa|edmonton|winnipeg|mississauga|brampton|gatineau|markham|vaughan|kitchener|waterloo|burnaby|laval)\b/i;

/**
 * Does this listing location clearly belong to the Canadian market? Used as the
 * authoritative filter on every Revolut row — we never trust the server-side
 * `?city=` filter alone (it's silently ignored when Revolut doesn't recognise
 * the value, returning the full global board). Conservative by design: a null
 * or non-Canadian location returns false so only roles that are *clearly*
 * Canadian survive.
 */
export function isCanadianLocation(location: string | null | undefined): boolean {
  if (!location) return false;
  return CANADA_LOCATION_RE.test(location);
}

// ---------------------------------------------------------------------------
// Listing health-check (turns a silent "0 jobs" into a typed, retryable error)
// ---------------------------------------------------------------------------

/** The two job counters Revolut renders in visible text on every healthy page. */
export interface ListingCounts {
  /** "Search from N open positions" — total matching the ACTIVE filter. */
  filtered: number | null;
  /** "We have N open positions" — GLOBAL board total, filter-independent. */
  global: number | null;
}

/**
 * Pull Revolut's own job counters out of the listing HTML. Reads body text
 * (not raw tags) so it's robust to element nesting. Either field is null when
 * its phrase is absent — which, for `global`, means the careers UI never
 * rendered (a Cloudflare challenge / redirect / redesign), since a healthy
 * page always shows the global total.
 */
export function parseListingCounts(html: string): ListingCounts {
  const text = (parseHtml(html).body?.textContent || "").replace(/\s+/g, " ");
  const toNum = (m: RegExpMatchArray | null): number | null =>
    m ? Number(m[1].replace(/,/g, "")) : null;
  return {
    filtered: toNum(text.match(/Search from ([\d,]+) open position/i)),
    global: toNum(text.match(/We have ([\d,]+) open position/i)),
  };
}

export type ListingVerdict =
  | { ok: true; reason: "parsed" | "genuinely-empty"; counts: ListingCounts }
  | {
      ok: false;
      reason: "unrendered" | "selector-drift";
      counts: ListingCounts;
      message: string;
    };

/**
 * Decide whether a parse of `rawCount` jobs is healthy, given the page's own
 * counters. The whole point is to stop a failed load from masquerading as an
 * empty board:
 *
 *   - rawCount > 0                      → parsed (happy path)
 *   - 0 parsed, no counters at all      → unrendered (block/redirect/redesign)
 *   - 0 parsed, filter reports N>0      → selector-drift (the June 2026 bug)
 *   - 0 parsed, filter reports 0/absent → genuinely-empty (legitimate)
 *
 * Pure + exported for unit testing.
 */
export function assessListing(
  rawCount: number,
  counts: ListingCounts
): ListingVerdict {
  if (rawCount > 0) return { ok: true, reason: "parsed", counts };

  if (counts.global === null && counts.filtered === null) {
    return {
      ok: false,
      reason: "unrendered",
      counts,
      message:
        "careers listing did not render (no 'We have N' / 'Search from N' counter found) — likely a Cloudflare challenge, a redirect, or a markup redesign",
    };
  }

  if ((counts.filtered ?? 0) > 0) {
    return {
      ok: false,
      reason: "selector-drift",
      counts,
      message: `page reports ${counts.filtered} open role(s) for this filter but parsed 0 — the job-anchor markup likely drifted`,
    };
  }

  // The page rendered its counters and the active filter shows no roles.
  return { ok: true, reason: "genuinely-empty", counts };
}

/**
 * Thrown when a Revolut scrape can't yield a trustworthy set of Canadian jobs:
 * the page never rendered (`unrendered`), the job-anchor markup drifted
 * (`selector-drift`), or the `?city=` filter was ignored so the board rendered
 * only non-Canadian roles (`filter-ignored`). Typed so the failure is legible
 * in the `job_run_tasks` row and so `scrape-heavy.yml`'s `scrape-retry` re-runs
 * on a fresh runner. Mirrors `WorkdayBlockedError`.
 */
export class RevolutScrapeError extends Error {
  constructor(
    public readonly reason: "unrendered" | "selector-drift" | "filter-ignored",
    detail: string,
    public readonly counts: ListingCounts
  ) {
    super(`Revolut: ${reason} — ${detail}`);
    this.name = "RevolutScrapeError";
  }
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

async function fetchListing(page: Page, careersUrl: string): Promise<string> {
  await page.goto(careersUrl, { waitUntil: "networkidle2", timeout: 60_000 });
  // Wait for at least one job anchor to render. A timeout here is NOT
  // conclusive — it happens both when Cloudflare holds the page AND when the
  // filter legitimately has zero roles. We therefore don't decide anything
  // here; `fetchRevolutJobs` disambiguates from the page's own counters after
  // reading the content. (Selector kept in lockstep with the parser via
  // JOB_ANCHOR_SELECTOR — a mismatch is what shipped the silent-zero bug.)
  await page
    .waitForSelector(JOB_ANCHOR_SELECTOR, { timeout: 20_000 })
    .catch(() => {
      log.warn(
        { careersUrl },
        "[revolut] no job anchors after 20s — disambiguating from page counters"
      );
    });
  return page.content();
}

// ---------------------------------------------------------------------------
// Description enrichment (per-job detail pages)
// ---------------------------------------------------------------------------

/**
 * Browser-side description extractor. String-sourced (like phenom-rbc) so
 * tsx's `__name` helper can't leak into the page context. Tries, in order of
 * stability:
 *   1. JSON-LD `JobPosting.description` — server-rendered for Google Jobs.
 *   2. The Next.js `__NEXT_DATA__` blob — first long `description`-like string.
 *   3. The largest `<main>`/`<article>` block as a fallback.
 * Returns `{ html, source }` or, on a miss, `{ source: "none", diag }` so the
 * failure is debuggable from the run log without a second instrumented pass.
 */
export const REVOLUT_DETAIL_EXTRACTOR_SRC = `(function () {
  // Strategy 1: JSON-LD JobPosting.
  var ld = document.querySelectorAll('script[type="application/ld+json"]');
  for (var i = 0; i < ld.length; i++) {
    var raw = ld[i].textContent || "";
    if (!raw) continue;
    try {
      var parsed = JSON.parse(raw);
      var arr = Array.isArray(parsed) ? parsed : [parsed];
      for (var c = 0; c < arr.length; c++) {
        var e = arr[c];
        if (e && e["@type"] === "JobPosting" && typeof e.description === "string" && e.description.length > 120) {
          return { html: e.description, source: "json-ld-JobPosting" };
        }
      }
    } catch (err) {}
  }

  // Strategy 2: __NEXT_DATA__ — recursively find the longest description-like
  // string. Revolut is Next.js, so the description ships in the page payload.
  var nd = document.getElementById("__NEXT_DATA__");
  var hasNextData = !!nd;
  if (nd && nd.textContent) {
    try {
      var data = JSON.parse(nd.textContent);
      var best = "";
      var stack = [data];
      var KEY = /description|jobDescription|body|content/i;
      while (stack.length) {
        var node = stack.pop();
        if (!node || typeof node !== "object") continue;
        for (var k in node) {
          var v = node[k];
          if (typeof v === "string") {
            if (KEY.test(k) && v.length > best.length && v.length > 200) best = v;
          } else if (v && typeof v === "object") {
            stack.push(v);
          }
        }
      }
      if (best) return { html: best, source: "next-data" };
    } catch (err2) {}
  }

  // Strategy 3: largest main/article block.
  var blocks = document.querySelectorAll("main, article, [role='main']");
  var bestHtml = "";
  for (var b = 0; b < blocks.length; b++) {
    var h = blocks[b].innerHTML || "";
    if (h.length > bestHtml.length) bestHtml = h;
  }
  if (bestHtml && bestHtml.length > 400) return { html: bestHtml, source: "main-fallback" };

  return {
    source: "none",
    diag: { jsonLd: ld.length, hasNextData: hasNextData, mainBlocks: blocks.length, bestMainLen: bestHtml.length },
  };
})()`;

type DetailExtractResult =
  | { html: string; source: string }
  | { source: "none"; diag: Record<string, unknown> };

/**
 * Visit one job's detail page on the (already Cloudflare-cleared) page and
 * attach `description_html` / `description_text`. Best-effort: the caller
 * try/catches so a single failure never aborts the run.
 */
async function enrichOne(page: Page, job: JobData): Promise<void> {
  if (!job.url) return;
  await page.goto(job.url, { waitUntil: "networkidle2", timeout: 45_000 });
  // Small settle for the SPA to paint the JSON-LD / content after hydration.
  await new Promise((r) => setTimeout(r, 600));
  const result = (await page.evaluate(REVOLUT_DETAIL_EXTRACTOR_SRC)) as DetailExtractResult;
  if ("html" in result && result.html) {
    const decoded = decodeHtmlEntities(result.html);
    job.description_html = decoded;
    job.description_text = htmlToText(decoded);
    log.info(
      { externalId: job.external_id, source: result.source, chars: job.description_text.length },
      "[revolut] enriched description"
    );
    return;
  }
  log.warn(
    { externalId: job.external_id, url: job.url, diag: (result as { diag?: unknown }).diag },
    "[revolut] no description found on detail page"
  );
}

/**
 * Enrich every job sequentially on the reused page. Revolut Canada is a tiny
 * corpus (single-digit roles), so the phenom/avature batch+concurrency machine
 * is overkill — and sequential reuse of the cleared session is the lowest
 * Cloudflare footprint. Each job is isolated in try/catch.
 */
async function enrichDescriptions(page: Page, jobs: JobData[]): Promise<void> {
  let enriched = 0;
  for (const job of jobs) {
    try {
      await enrichOne(page, job);
      if (job.description_text) enriched++;
    } catch (e) {
      log.warn(
        { externalId: job.external_id, err: e instanceof Error ? e.message : String(e) },
        "[revolut] description enrichment threw"
      );
    }
  }
  log.info({ enriched, total: jobs.length }, "[revolut] description enrichment complete");
}

export async function fetchRevolutJobs(
  atsIdentifier: string,
  careersUrl: string | undefined,
  browser?: Browser
): Promise<JobData[]> {
  void atsIdentifier;
  if (!careersUrl) {
    throw new Error(
      "[revolut] careersUrl is required (e.g. https://www.revolut.com/en-US/careers/?city=Canada)"
    );
  }

  const { browser: browserInstance, owned } = await acquireBrowser(browser);

  try {
    const page = await browserInstance.newPage();
    await page.setUserAgent(USER_AGENT);
    try {
      const html = await fetchListing(page, careersUrl);
      const raw = parseListingPage(html);
      const counts = parseListingCounts(html);
      const verdict = assessListing(raw.length, counts);

      if (!verdict.ok) {
        // A failed load must NOT masquerade as an empty board. Throw a typed
        // error so the task row reads legibly and scrape-retry runs on a
        // fresh runner.
        log.error(
          { careersUrl, counts, reason: verdict.reason },
          `[revolut] ${verdict.message}`
        );
        throw new RevolutScrapeError(verdict.reason, verdict.message, counts);
      }

      if (verdict.reason === "genuinely-empty") {
        log.info(
          { careersUrl, counts },
          "[revolut] listing rendered with no roles for this filter (0 matches)"
        );
        return [];
      }

      // Canadian-market guard. The server-side `?city=` filter is silently
      // ignored when Revolut doesn't recognise the value (it returns the full
      // global board, not an empty state — June 8 2026 incident). So we never
      // trust it alone: keep only roles that independently read as Canadian.
      const canadian = raw.filter((r) => isCanadianLocation(r.location));

      if (canadian.length === 0) {
        // We parsed roles (genuinely-empty already returned above) but none are
        // Canadian — the `?city=` filter wasn't applied and we're looking at
        // the global board. Fail loudly (typed, retryable) rather than ingest
        // the wrong market or silently return zero.
        const message = `parsed ${raw.length} role(s) but none are in the Canadian market — the ?city= filter looks ignored (filtered=${counts.filtered}, global=${counts.global})`;
        log.error(
          { careersUrl, parsed: raw.length, counts, sampleLocations: raw.slice(0, 5).map((r) => r.location) },
          `[revolut] ${message}`
        );
        throw new RevolutScrapeError("filter-ignored", message, counts);
      }

      if (canadian.length < raw.length) {
        log.warn(
          {
            careersUrl,
            parsed: raw.length,
            canadian: canadian.length,
            dropped: raw.filter((r) => !isCanadianLocation(r.location)).map((r) => r.location),
          },
          "[revolut] dropped non-Canadian role(s) that slipped past the ?city= filter"
        );
      }

      // Revolut server-renders only a ~6-item featured subset for large
      // filters; warn if the Canadian filter has outgrown what one load
      // captures (today Canada is well under that cap).
      if (counts.filtered !== null && canadian.length < counts.filtered) {
        log.warn(
          { careersUrl, parsed: canadian.length, reported: counts.filtered },
          "[revolut] parsed fewer Canadian roles than the page reports — Revolut may be lazy-loading beyond the rendered set; this filter now needs a scroll/pagination pass"
        );
      }

      log.info({ careersUrl, count: canadian.length, counts }, "[revolut] listing parsed");
      const jobs = canadian.map(mapRevolutJob);
      // Enrich descriptions from each detail page so the hot-path Flash
      // extractor can categorise the role (function_category / seniority /
      // department). Reuses the cleared page; best-effort per job.
      await enrichDescriptions(page, jobs);
      return jobs;
    } finally {
      await page.close();
    }
  } finally {
    if (owned) await browserInstance.close();
  }
}
