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

export async function fetchWorkdayCibcJobs(): Promise<JobData[]> {
  const urls = buildWorkdayUrls(TENANT, INSTANCE, SITE);
  const headers = buildWorkdayHeaders(TENANT, INSTANCE, SITE);
  const cap = resolveWorkdayJobCap(process.env.WORKDAY_CIBC_MAX_JOBS);

  const jobs: JobData[] = [];
  let offset = 0;
  let total: number | null = null;
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
