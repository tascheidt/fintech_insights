/**
 * Revolut careers scraper — custom-built SPA at `revolut.com/careers/`.
 *
 * Not on any third-party ATS (probed Smartrecruiters / Lever / Greenhouse /
 * Workable — Revolut is fully custom, Next.js + Cloudflare anti-bot in
 * front). Browser-based via puppeteer-core + @sparticuz/chromium, offloaded
 * to `scrape-heavy.yml`.
 *
 * The listing page (`/careers/?city=<location>`) renders each matching
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
 * Three hard-won facts about scraping this page (June 2026 — each shipped
 * broken and quietly returned 0 jobs for a stretch):
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
 *   3. The careers URL we navigate to must be LOCALE-LESS. The tenant's
 *      `careers_url` is `https://www.revolut.com/careers/?city=Canada` — NOT a
 *      locale-prefixed `/en-US/careers/...`. The `/en-US/` path no longer
 *      renders the board from a runner: it answers with a redirect / Cloudflare
 *      challenge, so the page shows no anchors and no counters and the scrape
 *      throws `unrendered` every run (June 20 2026 incident — Revolut Canada
 *      went stale for days against `/en-US/careers/?city=Canada`; the canonical
 *      `/careers/?city=Canada` renders normally). NOTE this is distinct from
 *      fact 1: the job hrefs ON the page may still carry a locale prefix, which
 *      is why the parser stays locale-agnostic — the constraint here is only the
 *      URL we navigate to.
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
 * Actions runner USED to clear it because the IP/UA pair read as residential
 * enough. Local dev runs may fail the challenge — that's expected; debug
 * against the workflow.
 *
 * June 2026: Revolut tightened that posture — datacenter-IP headless runs
 * started getting the interstitial too (every run `unrendered`: no anchors AND
 * no counters). The browser path has light anti-bot hardening and
 * `describeBlockedPage` stamps failures with the challenge markers. When that
 * diagnostic confirms a challenge, an Aug 2026 fallback reads Revolut's exact
 * server-rendered `#__NEXT_DATA__` script through a reader endpoint, filters
 * its complete position array locally, and enriches the surviving detail
 * payloads. If both paths fail, the typed error requests another fresh runner.
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
const REVOLUT_READER_ORIGIN = "https://r.jina.ai/";
const READER_TIMEOUT_MS = 60_000;
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

export interface RevolutPayloadLocation {
  country?: string;
  name?: string;
  type?: string;
}

export interface RevolutPayloadPosition {
  id?: string;
  text?: string;
  description?: string;
  team?: string;
  locations?: RevolutPayloadLocation[];
}

interface RevolutReaderPageProps {
  positions?: RevolutPayloadPosition[];
  position?: RevolutPayloadPosition;
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

/**
 * Reader responses prepend a short provenance header before the selected
 * `#__NEXT_DATA__` script. Pull out and validate that JSON payload without
 * depending on the human-readable title/URL lines.
 */
export function parseRevolutReaderPageProps(body: string): RevolutReaderPageProps {
  const marker = "Markdown Content:";
  const markerIndex = body.indexOf(marker);
  const afterMarker = markerIndex === -1 ? body : body.slice(markerIndex + marker.length);
  const jsonStart = afterMarker.indexOf("{");
  if (jsonStart === -1) {
    throw new Error("Revolut reader response contained no Next.js JSON payload");
  }
  const parsed = JSON.parse(afterMarker.slice(jsonStart).trim()) as {
    props?: { pageProps?: RevolutReaderPageProps };
  };
  const pageProps = parsed.props?.pageProps;
  if (!pageProps || typeof pageProps !== "object") {
    throw new Error("Revolut reader response contained no pageProps");
  }
  return pageProps;
}

/** Format the structured Next.js location array like the visible job card. */
export function formatRevolutLocations(
  locations: RevolutPayloadLocation[] | undefined
): string | null {
  if (!Array.isArray(locations) || locations.length === 0) return null;
  const office: string[] = [];
  const remote: string[] = [];

  for (const location of locations) {
    const raw = (location.name || location.country || "").trim();
    if (!raw) continue;
    const label = raw.replace(/\s*-\s*Remote$/i, "").trim();
    const bucket = /remote/i.test(location.type || "") ? remote : office;
    if (!bucket.includes(label)) bucket.push(label);
  }

  return [
    office.length > 0 ? `Office: ${office.join(" · ")}` : "",
    remote.length > 0 ? `Remote: ${remote.join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join(" ") || null;
}

/** Map a server-rendered Revolut position to canonical JobData. */
export function mapRevolutPayloadPosition(
  position: RevolutPayloadPosition
): JobData | null {
  const externalId = extractExternalId(position.id?.trim() || "");
  const title = position.text?.trim() || "";
  if (!externalId || !title) return null;
  const location = formatRevolutLocations(position.locations);
  const job = mapRevolutJob({
    externalId,
    title,
    location,
    // The id-only route is canonical and avoids reimplementing Revolut's
    // occasionally-inconsistent title slugger.
    url: `${REVOLUT_ORIGIN}/careers/position/${externalId}/`,
  });
  if (position.description) {
    const decoded = decodeHtmlEntities(position.description);
    job.description_html = decoded;
    job.description_text = htmlToText(decoded);
  }
  return job;
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

// ---------------------------------------------------------------------------
// Blocked-page diagnostic (turns an opaque `unrendered` into actionable evidence)
// ---------------------------------------------------------------------------

/**
 * Strong anti-bot interstitial markers. Kept narrow on purpose — a bare
 * "cloudflare" string appears in plenty of legit asset URLs, so it is NOT a
 * marker; each entry here is copy/markup that only a challenge page carries.
 */
const CHALLENGE_MARKERS: Array<[string, RegExp]> = [
  ["just-a-moment", /just a moment/i],
  ["challenge-platform", /cdn-cgi\/challenge-platform|challenge-platform/i],
  ["cf-chl", /cf[-_]chl|_cf_chl_opt/i],
  ["browser-verification", /cf-browser-verification|checking your browser|verifying you are human/i],
  ["attention-required", /attention required/i],
  ["turnstile", /turnstile/i],
  ["enable-js-cookies", /enable javascript and cookies/i],
];

export interface BlockDiagnostic {
  /** The page's <title>, or null. A challenge page is usually "Just a moment...". */
  title: string | null;
  /** True when a STRONG anti-bot marker matched — i.e. we were served a challenge. */
  challenge: boolean;
  /** Which markers matched (names), for the log/task row. */
  markers: string[];
  /** First ~200 chars of visible body text, for eyeballing an unknown block. */
  snippet: string;
}

/**
 * Diagnose a page that rendered NEITHER job anchors NOR Revolut's counters.
 * Distinguishes "Revolut handed the headless / datacenter-IP scraper a
 * Cloudflare anti-bot challenge" from a genuine markup change, so the
 * `unrendered` failure carries evidence instead of a guess. Pure + exported
 * for unit testing.
 */
export function describeBlockedPage(html: string): BlockDiagnostic {
  const doc = parseHtml(html);
  const title = (doc.querySelector("title")?.textContent || "").trim() || null;
  const bodyText = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
  const hay = `${title ?? ""} ${html}`;
  const markers = CHALLENGE_MARKERS.filter(([, re]) => re.test(hay)).map(([name]) => name);
  return { title, challenge: markers.length > 0, markers, snippet: bodyText.slice(0, 200) };
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
    // `--disable-blink-features=AutomationControlled` drops the most obvious
    // headless/automation tell that Cloudflare's managed challenge keys on.
    // Best-effort — it won't beat a TLS-fingerprint or Turnstile gate, but it
    // costs nothing and flips some managed challenges. (June 2026: Revolut's
    // Cloudflare posture tightened and datacenter-IP headless runs started
    // getting the "Just a moment" interstitial — see the `unrendered` path.)
    args: [...chromium.args, "--disable-blink-features=AutomationControlled"],
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
  const anchorSeen = await page
    .waitForSelector(JOB_ANCHOR_SELECTOR, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);

  // No anchors yet — could be a legitimately-empty filter OR a Cloudflare
  // challenge that auto-clears a few seconds after its JS runs. Give the real
  // board a second chance by waiting for Revolut's visible "open positions"
  // counter (present on every healthy page, filtered or not). If it never
  // appears, fetchRevolutJobs's counters check + describeBlockedPage decide
  // whether this was an empty filter or a block. String predicate so tsx's
  // `__name` helper can't leak into the page context.
  if (!anchorSeen) {
    log.warn(
      { careersUrl },
      "[revolut] no job anchors after 20s — waiting for the open-positions counter (possible Cloudflare hold)"
    );
    await page
      .waitForFunction(
        "/open position/i.test((document.body && document.body.innerText) || '')",
        { timeout: 15_000 }
      )
      .catch(() => {});
  }
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

async function fetchReaderPageProps(targetUrl: string): Promise<RevolutReaderPageProps> {
  const response = await fetch(`${REVOLUT_READER_ORIGIN}${targetUrl}`, {
    headers: {
      Accept: "text/plain",
      "X-Engine": "browser",
      "X-Target-Selector": "script#__NEXT_DATA__",
      "X-Timeout": "45",
    },
    signal: AbortSignal.timeout(READER_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`reader status ${response.status}`);
  }
  return parseRevolutReaderPageProps(await response.text());
}

async function enrichReaderDescriptions(jobs: JobData[]): Promise<void> {
  let enriched = 0;
  for (const job of jobs) {
    if (!job.url) continue;
    try {
      const detail = (await fetchReaderPageProps(job.url)).position;
      if (!detail || detail.id?.toLowerCase() !== job.external_id.toLowerCase()) {
        throw new Error("detail payload did not match the requested position");
      }
      if (detail.text) job.title = detail.text;
      const location = formatRevolutLocations(detail.locations);
      if (location) {
        job.location = location;
        job.location_type = detectLocationType(location, detail.description || "");
      }
      if (detail.description) {
        const decoded = decodeHtmlEntities(detail.description);
        job.description_html = decoded;
        job.description_text = htmlToText(decoded);
        enriched++;
      }
    } catch (error) {
      log.warn(
        { externalId: job.external_id, err: error instanceof Error ? error.message : String(error) },
        "[revolut] reader detail enrichment failed"
      );
    }
  }
  log.info(
    { enriched, total: jobs.length },
    "[revolut] reader description enrichment complete"
  );
}

/**
 * Cloudflare blocks GitHub's browser before Revolut renders any jobs. The
 * server-rendered Next.js payload still contains the full public position
 * array, so fetch that exact script through a standard reader and apply the
 * Canadian-market guard locally. This is a fallback only; the direct browser
 * remains primary while it works.
 */
export async function fetchRevolutJobsViaReader(
  careersUrl: string
): Promise<JobData[]> {
  const requested = new URL(careersUrl);
  if (!/^(?:www\.)?revolut\.com$/i.test(requested.hostname)) {
    throw new Error("reader fallback only accepts a revolut.com careers URL");
  }
  // Keep the relay target pinned to the public Revolut origin. `careersUrl`
  // comes from tenant configuration, so it must never turn this fallback into
  // an arbitrary third-party fetch.
  const target = new URL("/careers/", REVOLUT_ORIGIN);

  const pageProps = await fetchReaderPageProps(target.toString());
  if (!Array.isArray(pageProps.positions)) {
    throw new Error("reader payload contained no positions array");
  }

  const canadianPositions = pageProps.positions.filter((position) =>
    (position.locations ?? []).some((location) =>
      isCanadianLocation(`${location.name ?? ""} ${location.country ?? ""}`)
    )
  );
  const jobs = canadianPositions
    .map(mapRevolutPayloadPosition)
    .filter((job): job is JobData => job !== null);
  log.info(
    { global: pageProps.positions.length, canadian: jobs.length, source: "reader-next-data" },
    "[revolut] recovered listing from server-rendered payload"
  );
  await enrichReaderDescriptions(jobs);
  return jobs;
}

export async function fetchRevolutJobs(
  atsIdentifier: string,
  careersUrl: string | undefined,
  browser?: Browser
): Promise<JobData[]> {
  void atsIdentifier;
  if (!careersUrl) {
    throw new Error(
      "[revolut] careersUrl is required (e.g. https://www.revolut.com/careers/?city=Canada)"
    );
  }

  const { browser: browserInstance, owned } = await acquireBrowser(browser);

  try {
    const page = await browserInstance.newPage();
    await page.setUserAgent(USER_AGENT);
    // Look less like a headless bot to Cloudflare's managed challenge. All
    // best-effort and string-sourced (so tsx's `__name` helper can't leak into
    // the page context — same reason the detail extractor is a string):
    //   - mask `navigator.webdriver` (the canonical automation flag),
    //   - send a real Accept-Language, and a desktop viewport.
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument(
      "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
    );
    try {
      const html = await fetchListing(page, careersUrl);
      const raw = parseListingPage(html);
      const counts = parseListingCounts(html);
      const verdict = assessListing(raw.length, counts);

      if (!verdict.ok) {
        // A failed load must NOT masquerade as an empty board. Throw a typed
        // error so the task row reads legibly and scrape-retry runs on a
        // fresh runner. Attach a blocked-page diagnostic so the failure says
        // *why* nothing rendered — an anti-bot challenge (Revolut serving the
        // headless / datacenter-IP runner Cloudflare) reads very differently
        // from a genuine markup redesign, and the two need different fixes.
        const diag = describeBlockedPage(html);
        log.error(
          { careersUrl, counts, reason: verdict.reason, diag },
          `[revolut] ${verdict.message}`
        );
        if (diag.challenge) {
          log.warn(
            { careersUrl, markers: diag.markers },
            "[revolut] browser was challenged; trying server-rendered payload fallback"
          );
          try {
            return await fetchRevolutJobsViaReader(careersUrl);
          } catch (fallbackError) {
            const fallbackMessage =
              fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            log.error(
              { careersUrl, err: fallbackMessage },
              "[revolut] server-rendered payload fallback failed"
            );
            throw new RevolutScrapeError(
              verdict.reason,
              `${verdict.message} — served an anti-bot challenge (title=${JSON.stringify(
                diag.title
              )}, markers=${diag.markers.join(",")}); payload fallback failed: ${fallbackMessage}`,
              counts
            );
          }
        }
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
