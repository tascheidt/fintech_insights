/**
 * TD Bank — Workday tenant scraper.
 *
 * Tenant: `td`. Instance: `wd3`. Site: `TD_Bank_Careers`.
 *
 * Workday is fetch-based (documented JSON API), but the runtime decides
 * whether it runs inline on Vercel or offloaded to GitHub Actions via
 * `scrape-heavy.yml` — the coordinator adds `workday-td` to
 * `isBrowserScraper`. Either way, no `browser` param needed here.
 *
 * Two-step shape:
 *   1. POST `.../jobs` with `{ limit: 20, offset, searchText: "",
 *      appliedFacets: {} }` until `offset >= total`.
 *   2. For each listing row, GET `.../job<externalPath>` and merge the
 *      `jobDescription` HTML into the JobData.
 *
 * Errors bubble up (no in-code retry-with-backoff): the cron retries
 * tomorrow.
 *
 * Cost knob: `WORKDAY_TD_MAX_JOBS` env caps the run. Unset → full corpus.
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

const TENANT = "td";
const INSTANCE = "wd3";
const SITE = "TD_Bank_Careers";
const PAGE_LIMIT = 20;
const FETCH_TIMEOUT_MS = 15_000;

export async function fetchWorkdayTdJobs(): Promise<JobData[]> {
  const urls = buildWorkdayUrls(TENANT, INSTANCE, SITE);
  const headers = buildWorkdayHeaders(TENANT, INSTANCE, SITE);
  const cap = resolveWorkdayJobCap(process.env.WORKDAY_TD_MAX_JOBS);

  const jobs: JobData[] = [];
  let offset = 0;
  let total: number | null = null;
  // Captured once from the first successful listing POST and replayed on
  // every detail GET — keeps Akamai's `_abck` fingerprint stable for the
  // run. Empty until the first response comes back.
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
      throw new Error(`Workday TD listing error: ${res.status}`);
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
      if (job) jobs.push(job);
    }

    offset += rows.length;
    if (cap != null && jobs.length >= cap) break;
    if (total != null && offset >= total) break;
  }

  if (cap != null && jobs.length > cap) jobs.length = cap;

  log.info(
    { fetched: jobs.length, total, cap: cap ?? "uncapped" },
    "[workday-td] listings complete; enriching descriptions"
  );

  // Step 2: enrich each row with the detail response. Sequential because
  // Workday's surface throttles aggressively on parallel fetches from a
  // single IP — and the listing alone is enough to populate the dashboard
  // even if enrichment partially fails.
  let enriched = 0;
  let failed = 0;
  for (const job of jobs) {
    if (!job.url) continue;
    // Reconstruct externalPath from the public URL — same as listing row
    // mapping but in reverse — or fall back to skipping.
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
        "[workday-td] detail enrichment failed"
      );
    }
  }

  log.info(
    { enriched, failed, total: jobs.length },
    "[workday-td] description enrichment complete"
  );

  return jobs;
}

/**
 * Extract the `externalPath` portion from a public Workday URL.
 * `https://td.wd3.myworkdayjobs.com/TD_Bank_Careers/job/Toronto/X_R-123`
 *   → `/job/Toronto/X_R-123`
 */
function extractExternalPathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/${SITE}`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  const tail = publicUrl.slice(idx + marker.length);
  return tail.startsWith("/") ? tail : null;
}
