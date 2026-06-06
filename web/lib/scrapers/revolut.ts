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
 * Description enrichment is deferred. Detail pages need a separate parser
 * pass and the production hot path tolerates null descriptions (the
 * description_hash gate in `processor.ts` simply skips Flash extraction for
 * that row, and the Pro analyzer grounds against the URL anyway). Add
 * enrichment in a follow-up once the listing pipeline is proven green.
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
import { detectLocationType } from "./utils";
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
 * Thrown when a Revolut scrape returns zero jobs for a reason that is NOT a
 * legitimately-empty filter — i.e. the page never rendered (`unrendered`) or
 * the job-anchor markup drifted (`selector-drift`). Typed so the failure is
 * legible in the `job_run_tasks` row and so `scrape-heavy.yml`'s `scrape-retry`
 * re-runs on a fresh runner. Mirrors `WorkdayBlockedError`.
 */
export class RevolutScrapeError extends Error {
  constructor(
    public readonly reason: "unrendered" | "selector-drift",
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

      // We parsed jobs. Revolut server-renders only a ~6-item featured subset
      // for large filters; warn if this filter has outgrown what one load
      // captures (today Canada is well under that cap).
      if (counts.filtered !== null && raw.length < counts.filtered) {
        log.warn(
          { careersUrl, parsed: raw.length, reported: counts.filtered },
          "[revolut] parsed fewer roles than the page reports — Revolut may be lazy-loading beyond the rendered set; this filter now needs a scroll/pagination pass"
        );
      }

      log.info({ careersUrl, count: raw.length, counts }, "[revolut] listing parsed");
      return raw.map(mapRevolutJob);
    } finally {
      await page.close();
    }
  } finally {
    if (owned) await browserInstance.close();
  }
}
