/**
 * Revolut careers scraper — custom-built SPA at `revolut.com/careers/`.
 *
 * Not on any third-party ATS (probed Smartrecruiters / Lever / Greenhouse /
 * Workable — Revolut is fully custom, Next.js + Cloudflare anti-bot in
 * front). Browser-based via puppeteer-core + @sparticuz/chromium, offloaded
 * to `scrape-heavy.yml`.
 *
 * The listing page (`/en-US/careers/?city=<location>`) server-renders every
 * job for the active filter as a stable anchor:
 *
 *   <a href="/careers/position/<slug>-<uuid>/" class="...">
 *     <span>
 *       <h2>Title</h2>
 *       <span>...<span>Remote: Canada</span></span>
 *     </span>
 *   </a>
 *
 * The UUID trailing the slug is the canonical external_id. There's no
 * pagination — the page renders the full filtered set (Canada = 3 today;
 * other filters can return more, but Revolut still emits all of them on the
 * first response).
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
 *   /careers/position/head-of-risk-257ab149-12e7-4a84-bda0-1ab1a1d36760/
 *     → "257ab149-12e7-4a84-bda0-1ab1a1d36760"
 *
 * The UUID is the stable per-job identifier; the slug prefix can change if
 * Revolut renames the role. Trailing slash tolerated. Returns "" when no
 * UUID is found — caller filters those out.
 */
export function extractExternalId(href: string): string {
  if (!href) return "";
  const match = href.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i
  );
  return match ? match[1].toLowerCase() : "";
}

/**
 * Parse the listing HTML → raw rows. Walks every anchor whose href starts
 * with `/careers/position/` (the stable URL prefix), pulls the `<h2>` for
 * the title and the deepest text node under the anchor for the location
 * (Revolut puts "Remote: Canada" / "London, UK" / etc. in a span sibling to
 * the location icon — we grab it by skipping any element with the icon
 * class and taking the last non-empty descendant text).
 */
export function parseListingPage(html: string): RevolutRawJob[] {
  const doc = parseHtml(html);
  const anchors = doc.querySelectorAll<HTMLAnchorElement>(
    'a[href^="/careers/position/"]'
  );

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
  // Wait for the listing to render. The selector also serves as a
  // proof-of-pass for the Cloudflare challenge — if we never see a position
  // anchor, we're either still on the challenge page or the filter
  // genuinely returned zero results.
  await page
    .waitForSelector('a[href^="/careers/position/"]', { timeout: 20_000 })
    .catch(() => {
      log.warn(
        { careersUrl },
        "[revolut] no position anchors after 20s — Cloudflare may be holding the page, or the filter returned zero jobs"
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
      log.info(
        { careersUrl, count: raw.length },
        "[revolut] listing parsed"
      );
      return raw.map(mapRevolutJob);
    } finally {
      await page.close();
    }
  } finally {
    if (owned) await browserInstance.close();
  }
}
