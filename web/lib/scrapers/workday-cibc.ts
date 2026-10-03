/**
 * CIBC — Workday tenant scraper.
 *
 * Tenant: `cibc`. Instance: `wd3`. Site: `search`.
 *
 * **Simplii classifier is live.** After description enrichment (Step 2),
 * every job is tested by `isSimpliiPosting` using its title and
 * description_text. When matched, the job is tagged with
 * `companySlugOverride: 'simplii'` and the processor routes it to the
 * Simplii companies row (tier=fintech, parent_company_id=cibc.id)
 * instead of CIBC. Sub-brand split runs post-enrichment so the body is
 * available; classification on title alone handles enrichment failures.
 *
 * Rule: Simplii iff title matches `/\bsimplii\b/i` OR description
 * contains >=2 occurrences of `/\bsimplii\b/i`. A single passing
 * mention (e.g. a CIBC infra role citing "Simplii & CBFAT") does NOT
 * route to Simplii. Sub-brand split is per-row only — there is no
 * separate Simplii URL or listing endpoint.
 *
 * When incumbent tracking is disabled, the heavy-scraper entrypoint calls
 * this scraper with `simpliiOnly: true`. Workday then searches for
 * "Simplii" before pagination, shrinking the candidate set from ~500 CIBC
 * postings to roughly 10. The post-enrichment classifier remains authoritative
 * and drops search false positives. Full-corpus mode is preserved whenever
 * incumbent tracking is enabled.
 * If Akamai challenges the direct CXS listing in Simplii-only mode, a
 * browser-backed reader fetches the same Workday search and CXS details.
 * The fallback validates the displayed result count before returning jobs.
 *
 * Cost knob: `WORKDAY_CIBC_MAX_JOBS` env caps the selected result set.
 * Unset → all results for the active mode.
 */

import type { JobData } from "./types";
import { detectLocationType, htmlToText } from "./utils";
import {
  buildWorkdayUrls,
  buildWorkdayHeaders,
  extractCookieJar,
  parseWorkdayListingRow,
  parseWorkdayJobDetail,
  parseWorkdayJson,
  WorkdayBlockedError,
  resolveWorkdayJobCap,
  type WorkdayListingResponse,
  type WorkdayJobDetailResponse,
} from "./workday-utils";
import { log } from "@/lib/log";

const TENANT = "cibc";
const INSTANCE = "wd3";
const SITE = "search";
const PAGE_LIMIT = 20;
const FETCH_TIMEOUT_MS = 15_000;
const READER_TIMEOUT_MS = 60_000;
const READER_ORIGIN = "https://r.jina.ai/";
const READER_SEARCH_URL = "https://cibc.wd3.myworkdayjobs.com/en-US/search?q=Simplii";

interface ReaderPage {
  url?: string;
  httpStatus?: number;
  content?: string;
  text?: string;
  links?: unknown;
}

/** Structural diagnostics only: never log page bodies, cookies or headers. */
export function summarizeCibcReaderPage(page: ReaderPage) {
  const text = typeof page.text === "string" ? page.text :
    typeof page.content === "string" ? page.content : "";
  return {
    httpStatus: page.httpStatus,
    textLength: text.length,
    count: text.match(/(?:^|\n)\s*(\d+)\s+JOBS?\s+FOUND\b/i)?.[1] ?? null,
    linksType: Array.isArray(page.links) ? "array" : typeof page.links,
    linksCount: Array.isArray(page.links) ? page.links.length : null,
    maintenanceNotice: /maintenance|temporarily unavailable|service unavailable/i.test(text),
    challengeNotice: /akamai|cloudflare|access denied|verify you are human/i.test(text),
  };
}

/** Listings are structured DOM data, not articles for readability extraction. */
export function buildCibcReaderHeaders(listing = false): Record<string, string> {
  return {
    Accept: "application/json",
    "X-Engine": "browser",
    "X-No-Cache": "true",
    ...(listing
      ? {
          "X-Respond-With": "text",
          // Reader waits for network idle (or this bound), rather than
          // snapshotting as soon as the first job link appears.
          "X-Timeout": "30",
          "X-Wait-For-Selector": "a[data-automation-id=jobTitle]",
          "X-With-Links-Summary": "all",
        }
      : {}),
  };
}

async function fetchReaderPage<T>(
  targetUrl: string,
  parse: (page: ReaderPage) => T,
  listing = false
): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let snapshot: ReturnType<typeof summarizeCibcReaderPage> | undefined;
    try {
      const response = await fetch(`${READER_ORIGIN}${targetUrl}`, {
        headers: buildCibcReaderHeaders(listing),
        signal: AbortSignal.timeout(READER_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`CIBC reader request failed: HTTP ${response.status}`);
      }
      const envelope: unknown = await response.json();
      if (!envelope || typeof envelope !== "object" || !("data" in envelope)) {
        throw new Error("CIBC reader returned no data envelope");
      }
      const page = envelope.data as ReaderPage;
      if (page && typeof page === "object") snapshot = summarizeCibcReaderPage(page);
      if (page?.url !== targetUrl || page.httpStatus !== 200) {
        throw new Error("CIBC reader did not return the requested Workday page");
      }
      // HTTP 200 is not a complete scrape. Validate the snapshot before
      // accepting an attempt, using the same bounded transport budget.
      return parse(page);
    } catch (error) {
      log.warn(
        { targetUrl, attempt, snapshot, err: error instanceof Error ? error.message : String(error) },
        "[workday-cibc] reader attempt failed validation or transport"
      );
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw new Error("CIBC reader attempts exhausted");
}

/** Convert a browser-rendered Workday search page into the usual job rows. */
export function parseCibcReaderListing(page: ReaderPage): JobData[] {
  const text = page.text ?? page.content;
  const count = text?.match(/(?:^|\n)\s*(\d+)\s+JOBS?\s+FOUND\b/i);
  if (!count || !Array.isArray(page.links)) {
    throw new Error(
      `CIBC reader search did not render a complete jobs list (count=${count?.[1] ?? "missing"}, ` +
      `links=${Array.isArray(page.links) ? page.links.length : "missing"}, textBytes=${text?.length ?? 0})`
    );
  }
  const total = Number(count[1]);
  const urls = buildWorkdayUrls(TENANT, INSTANCE, SITE);
  const jobs: JobData[] = [];
  const seen = new Set<string>();
  for (const link of page.links) {
    if (!Array.isArray(link) || link.length !== 2 ||
        typeof link[0] !== "string" || typeof link[1] !== "string") continue;
    let href: URL;
    try {
      href = new URL(link[1]);
    } catch {
      continue;
    }
    if (href.protocol !== "https:" || href.hostname !== "cibc.wd3.myworkdayjobs.com") continue;
    const path = href.pathname.match(/^\/(?:[a-z]{2}-[a-z]{2}\/)?search(\/job\/.+)$/i);
    if (!path) continue;
    if (!link[0].trim() || seen.has(path[1])) {
      throw new Error("CIBC reader search contained an empty or duplicate job link");
    }
    seen.add(path[1]);
    const job = parseWorkdayListingRow(
      { title: link[0], externalPath: path[1] },
      urls.jobPublicUrl
    );
    if (!job) throw new Error("CIBC reader search contained an invalid job");
    jobs.push(job);
  }
  // The public Workday page shows at most 20 roles. Never ingest a partial
  // page: that could incorrectly mark an unseen Simplii role as closed.
  if (total !== jobs.length || total > PAGE_LIMIT) {
    throw new Error(`CIBC reader search was incomplete: ${jobs.length} links for ${total} jobs`);
  }
  return jobs;
}

/** Read the same CXS detail JSON through a browser-backed relay. */
export function parseCibcReaderDetail(page: ReaderPage): WorkdayJobDetailResponse {
  if (!page.content) throw new Error("CIBC reader detail was empty");
  const detail: WorkdayJobDetailResponse = JSON.parse(page.content);
  if (!detail.jobPostingInfo?.title || !detail.jobPostingInfo.jobDescription) {
    throw new Error("CIBC reader detail had no job title or description");
  }
  return detail;
}

export interface WorkdayCibcOptions {
  /** Search Workday for Simplii candidates instead of scanning all CIBC roles. */
  simpliiOnly?: boolean;
}

/** Pure request builder so the cost-sensitive search scope is pinned in tests. */
export function buildCibcListingRequest(
  offset: number,
  options: WorkdayCibcOptions = {}
): {
  limit: number;
  offset: number;
  searchText: string;
  appliedFacets: Record<string, never>;
} {
  return {
    limit: PAGE_LIMIT,
    offset,
    searchText: options.simpliiOnly ? "Simplii" : "",
    appliedFacets: {},
  };
}

/**
 * Simplii brand classifier. Pure, exported for unit testing.
 *
 * A job is Simplii if and only if:
 *   (a) its title matches `/\bsimplii\b/i`, OR
 *   (b) its description contains >=2 occurrences of `/\bsimplii\b/i`.
 *
 * A single passing mention in the body (e.g. a CIBC infra role that
 * supports "Simplii & CBFAT" systems) does NOT route to Simplii — only
 * >=2 body occurrences are treated as a strong signal.
 *
 * The previous implementation did a blind `Object.entries` walk over
 * every string field of the raw listing row plus a `bulletFields` scan.
 * That caused a mass-mis-tagging incident (504 CIBC jobs tagged Simplii
 * in one run) and has been REMOVED. Classification now runs
 * post-enrichment so the description is available.
 *
 * Returns `{ isMatch: true, marker }` where `marker` is `"title"` or
 * `"description"`, or `{ isMatch: false }`.
 *
 * "Simply" or "simplistic" must NOT match — the word boundary regex
 * (`\bsimplii\b`, case-insensitive) handles this.
 */
export function isSimpliiPosting(input: {
  title?: string | null;
  description?: string | null;
}): { isMatch: boolean; marker?: string } {
  const pattern = /\bsimplii\b/i;
  const title = input.title ?? "";
  if (pattern.test(title)) {
    return { isMatch: true, marker: "title" };
  }
  const description = input.description ?? "";
  // A single passing mention (e.g. a CIBC infra role that supports the
  // "Simplii & CBFAT" systems) must NOT route to Simplii. Require >=2
  // occurrences in the body as the "strong signal" threshold.
  const matches = description.match(/\bsimplii\b/gi);
  if (matches && matches.length >= 2) {
    return { isMatch: true, marker: "description" };
  }
  return { isMatch: false };
}

export async function fetchWorkdayCibcJobs(
  options: WorkdayCibcOptions = {}
): Promise<JobData[]> {
  const urls = buildWorkdayUrls(TENANT, INSTANCE, SITE);
  const headers = buildWorkdayHeaders(TENANT, INSTANCE, SITE);
  const cap = resolveWorkdayJobCap(process.env.WORKDAY_CIBC_MAX_JOBS);

  const jobs: JobData[] = [];
  let offset = 0;
  let total: number | null = null;
  let cookieJar = "";
  let listingViaReader = false;
  let detailsViaReader = false;

  // Step 1: paginate the listing.
  try {
    while (true) {
      const res = await fetch(urls.listingPostUrl, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          ...(cookieJar ? { Cookie: cookieJar } : {}),
        },
        body: JSON.stringify(buildCibcListingRequest(offset, options)),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`Workday CIBC listing error: ${res.status}`);
      }
      if (!cookieJar) cookieJar = extractCookieJar(res);
      const data = await parseWorkdayJson<WorkdayListingResponse>(res, TENANT);
      const rows = data.jobPostings ?? [];
      if (rows.length === 0) break;
      // Workday returns the real `total` only on the first page; subsequent
      // pages echo `total: 0` while still returning real `jobPostings`.
      if (typeof data.total === "number" && data.total > 0) {
        total = data.total;
      }

      for (const row of rows) {
        const job = parseWorkdayListingRow(row, urls.jobPublicUrl);
        if (job) jobs.push(job);
      }

      offset += rows.length;
      if (cap != null && jobs.length >= cap) break;
      if (total != null && offset >= total) break;
    }
  } catch (error) {
    if (!options.simpliiOnly || !(error instanceof WorkdayBlockedError)) throw error;
    log.warn({ err: error.message }, "[workday-cibc] direct listing blocked; using browser-backed reader");
    jobs.length = 0;
    jobs.push(...await fetchReaderPage(READER_SEARCH_URL, parseCibcReaderListing, true));
    total = jobs.length;
    listingViaReader = true;
  }

  if (cap != null && jobs.length > cap) jobs.length = cap;

  log.info(
    {
      fetched: jobs.length,
      total,
      cap: cap ?? "uncapped",
      mode: options.simpliiOnly ? "simplii-only" : "full-cibc",
      source: listingViaReader ? "reader" : "direct",
    },
    "[workday-cibc] listings complete; enriching descriptions"
  );

  // Step 2: enrich each row's description.
  let enriched = 0;
  let failed = 0;
  for (const job of jobs) {
    if (!job.url) continue;
    const externalPath = extractExternalPathFromPublicUrl(job.url);
    if (!externalPath) continue;
    try {
      const detailUrl = urls.jobGetUrl(externalPath);
      let detail: WorkdayJobDetailResponse;
      if (!detailsViaReader) {
        try {
          const detailRes = await fetch(detailUrl, {
            headers: {
              ...headers,
              ...(cookieJar ? { Cookie: cookieJar } : {}),
            },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (!detailRes.ok) throw new Error(`status ${detailRes.status}`);
          detail = await parseWorkdayJson<WorkdayJobDetailResponse>(detailRes, TENANT);
        } catch (error) {
          if (!options.simpliiOnly) throw error;
          detailsViaReader = true;
          log.warn(
            { externalId: job.external_id, err: error instanceof Error ? error.message : String(error) },
            "[workday-cibc] direct detail failed; using browser-backed reader"
          );
          detail = await fetchReaderPage(detailUrl, parseCibcReaderDetail);
        }
      } else {
        detail = await fetchReaderPage(detailUrl, parseCibcReaderDetail);
      }
      const parsed = parseWorkdayJobDetail(detail);
      if (options.simpliiOnly && !parsed.description_text) {
        throw new Error("Workday CIBC detail had no description");
      }
      if (parsed.description_html) {
        job.description_html = parsed.description_html;
        job.description_text = parsed.description_text || htmlToText(parsed.description_html);
      }
      if (parsed.location && !job.location) {
        job.location = parsed.location;
        job.location_type = detectLocationType(parsed.location, job.description_text ?? "");
      }
      if (parsed.posted_date && !job.posted_date) job.posted_date = parsed.posted_date;
      enriched++;
    } catch (e) {
      failed++;
      log.warn(
        {
          externalId: job.external_id,
          err: e instanceof Error ? e.message : String(e),
        },
        "[workday-cibc] detail enrichment failed"
      );
      // In Simplii-only mode a description may be the only brand signal.
      // An incomplete run could incorrectly close an active Simplii role.
      if (options.simpliiOnly) throw e;
    }
  }

  log.info(
    { enriched, failed, total: jobs.length },
    "[workday-cibc] description enrichment complete"
  );

  // Brand split: route Simplii postings to the Simplii sub-brand. Runs AFTER
  // enrichment so the description is available (the rule needs the body).
  // Even if enrichment failed for a job, we still classify on title alone.
  let simpliiSeen = 0;
  for (const job of jobs) {
    const simplii = isSimpliiPosting({
      title: job.title,
      description: job.description_text,
    });
    if (simplii.isMatch) {
      simpliiSeen++;
      job.companySlugOverride = "simplii";
      log.info(
        { jobReqId: job.external_id, title: job.title, marker: simplii.marker },
        "[workday-cibc] routing to simplii"
      );
    }
  }
  log.info(
    { simpliiSeen, total: jobs.length },
    "[workday-cibc] brand split complete"
  );

  return jobs;
}

function extractExternalPathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/${SITE}`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  const tail = publicUrl.slice(idx + marker.length);
  return tail.startsWith("/") ? tail : null;
}
