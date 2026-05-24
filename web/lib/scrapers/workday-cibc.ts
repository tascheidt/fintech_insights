/**
 * CIBC — Workday tenant scraper.
 *
 * Tenant: `cibc`. Instance: `wd3`. Site: `search`.
 *
 * **Simplii classifier is LOG-ONLY for Phase 3.** Each listing row is
 * inspected for a Simplii brand marker (in `bulletFields`, title, or any
 * other visible string). When matched, we log and continue — we do NOT
 * set a `companySlugOverride` field. Per Farhan: confirm Simplii postings
 * actually surface from CIBC's Workday in production before adding the
 * override mechanism + the Simplii companies row (Phase 3.5).
 *
 * Cost knob: `WORKDAY_CIBC_MAX_JOBS` env caps the run. Unset → full
 * corpus.
 */

import type { JobData } from "./types";
import { htmlToText } from "./utils";
import {
  buildWorkdayUrls,
  buildWorkdayHeaders,
  extractCookieJar,
  parseWorkdayListingRow,
  parseWorkdayJobDetail,
  resolveWorkdayJobCap,
  type WorkdayListingRow,
  type WorkdayListingResponse,
  type WorkdayJobDetailResponse,
} from "./workday-utils";
import { log } from "@/lib/log";

const TENANT = "cibc";
const INSTANCE = "wd3";
const SITE = "search";
const PAGE_LIMIT = 20;
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Simplii brand classifier. Pure, exported for unit testing.
 *
 * Inspects every string-valued field of the raw listing row (title,
 * bulletFields, and any tenant-emitted brand/business-unit metadata)
 * for a case-insensitive "simplii" token surrounded by word boundaries.
 *
 * Returns `{ isMatch: true, marker }` where `marker` names the field
 * the match was found in (for log readability), or `{ isMatch: false }`.
 *
 * "Simply" or "simplistic" must NOT match — the word boundary regex
 * (`\bsimplii\b`, case-insensitive) handles this.
 */
export function isSimpliiPosting(raw: WorkdayListingRow): {
  isMatch: boolean;
  marker?: string;
} {
  const pattern = /\bsimplii\b/i;

  // Highest-signal candidates first so the returned `marker` is the most
  // useful descriptor.
  if (typeof raw.title === "string" && pattern.test(raw.title)) {
    return { isMatch: true, marker: "title" };
  }

  if (Array.isArray(raw.bulletFields)) {
    for (const b of raw.bulletFields) {
      if (typeof b === "string" && pattern.test(b)) {
        return { isMatch: true, marker: "bulletFields" };
      }
    }
  }

  // Walk every other string-valued top-level field. Workday tenants
  // sometimes surface brand/business-unit metadata under varying keys,
  // and we don't want a missing key to silently drop the signal.
  for (const [key, value] of Object.entries(raw)) {
    if (key === "title" || key === "bulletFields") continue;
    if (typeof value === "string" && pattern.test(value)) {
      return { isMatch: true, marker: key };
    }
  }

  return { isMatch: false };
}

export async function fetchWorkdayCibcJobs(): Promise<JobData[]> {
  const urls = buildWorkdayUrls(TENANT, INSTANCE, SITE);
  const headers = buildWorkdayHeaders(TENANT, INSTANCE, SITE);
  const cap = resolveWorkdayJobCap(process.env.WORKDAY_CIBC_MAX_JOBS);

  const jobs: JobData[] = [];
  let offset = 0;
  let total: number | null = null;
  let simpliiSeen = 0;
  let cookieJar = "";

  // Step 1: paginate the listing.
  while (true) {
    const res = await fetch(urls.listingPostUrl, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        ...(cookieJar ? { Cookie: cookieJar } : {}),
      },
      body: JSON.stringify({
        limit: PAGE_LIMIT,
        offset,
        searchText: "",
        appliedFacets: {},
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Workday CIBC listing error: ${res.status}`);
    }
    if (!cookieJar) cookieJar = extractCookieJar(res);
    const data = (await res.json()) as WorkdayListingResponse;
    const rows = data.jobPostings ?? [];
    if (rows.length === 0) break;
    // Workday returns the real `total` only on the first page; subsequent
    // pages echo `total: 0` while still returning real `jobPostings`. Treat
    // any non-positive value as missing or we exit the loop at offset=40.
    if (typeof data.total === "number" && data.total > 0) {
      total = data.total;
    }

    for (const row of rows) {
      const job = parseWorkdayListingRow(row, urls.jobPublicUrl);
      if (!job) continue;

      // Simplii classifier — log-only mode for Phase 3. Do NOT mutate
      // the job; Phase 3.5 wires the override + companies row.
      const simplii = isSimpliiPosting(row);
      if (simplii.isMatch) {
        simpliiSeen++;
        log.info(
          {
            jobReqId: job.external_id,
            title: job.title,
            marker: simplii.marker,
          },
          "[workday-cibc] would-route-to-simplii (log-only Phase 3)"
        );
      }

      jobs.push(job);
    }

    offset += rows.length;
    if (cap != null && jobs.length >= cap) break;
    if (total != null && offset >= total) break;
  }

  if (cap != null && jobs.length > cap) jobs.length = cap;

  log.info(
    {
      fetched: jobs.length,
      total,
      cap: cap ?? "uncapped",
      simpliiSeen,
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
      const detailRes = await fetch(urls.jobGetUrl(externalPath), {
        headers: {
          ...headers,
          ...(cookieJar ? { Cookie: cookieJar } : {}),
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!detailRes.ok) {
        throw new Error(`status ${detailRes.status}`);
      }
      const detail = (await detailRes.json()) as WorkdayJobDetailResponse;
      const parsed = parseWorkdayJobDetail(detail);
      if (parsed.description_html) {
        job.description_html = parsed.description_html;
        job.description_text = parsed.description_text || htmlToText(parsed.description_html);
      }
      if (parsed.location && !job.location) job.location = parsed.location;
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
    }
  }

  log.info(
    { enriched, failed, total: jobs.length },
    "[workday-cibc] description enrichment complete"
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
