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
  parseWorkdayJson,
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
// Enrichment is chunked + concurrent: each batch drains a shared queue
// with `ENRICH_CONCURRENCY` workers, then logs progress. TD's ~1,600 jobs
// at 600-700ms each ran sequentially in ~18 min — too long a tail for
// transient Supabase / runner hiccups (May 28 2026 incident). At
// concurrency=4 the same corpus lands in ~4-5 min. Workday's Akamai edge
// tolerates this — sibling tenants (`phenom-rbc`, `avature-bnc`) use the
// same 50/4 shape against equally-protected surfaces.
const ENRICH_BATCH_SIZE = 50;
const DEFAULT_ENRICH_CONCURRENCY = 4;

function resolveEnrichConcurrency(): number {
  const raw = process.env.WORKDAY_TD_CONCURRENCY;
  if (raw && /^\d+$/.test(raw)) {
    return Math.max(1, Math.min(8, parseInt(raw, 10)));
  }
  return DEFAULT_ENRICH_CONCURRENCY;
}

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
    // Akamai can return HTTP 200 with an HTML challenge body (greylisted
    // runner IP) — parseWorkdayJson throws a typed WorkdayBlockedError so the
    // failure is legible and the scrape-heavy.yml retry re-runs on a fresh IP.
    const data = await parseWorkdayJson<WorkdayListingResponse>(res, TENANT);
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

  const concurrency = resolveEnrichConcurrency();
  log.info(
    {
      fetched: jobs.length,
      total,
      cap: cap ?? "uncapped",
      batchSize: ENRICH_BATCH_SIZE,
      concurrency,
    },
    "[workday-td] listings complete; enriching descriptions"
  );

  // Step 2: enrich descriptions. Chunked into `ENRICH_BATCH_SIZE` slices,
  // each drained by `concurrency` workers sharing a queue. Same shape as
  // `phenom-rbc` and `avature-bnc` — progress logs per batch leave a
  // high-water mark if a long run is killed.
  const detailHeaders = {
    ...headers,
    ...(cookieJar ? { Cookie: cookieJar } : {}),
  };
  const batchCount = Math.ceil(jobs.length / ENRICH_BATCH_SIZE);
  let totalEnriched = 0;
  let totalFailed = 0;
  for (let i = 0; i < jobs.length; i += ENRICH_BATCH_SIZE) {
    const batchNum = Math.floor(i / ENRICH_BATCH_SIZE) + 1;
    const batch = jobs.slice(i, i + ENRICH_BATCH_SIZE);
    const { enriched, failed } = await enrichBatch(
      batch,
      detailHeaders,
      urls.jobGetUrl,
      concurrency
    );
    totalEnriched += enriched;
    totalFailed += failed;
    log.info(
      {
        batch: batchNum,
        batchCount,
        processed: Math.min(i + ENRICH_BATCH_SIZE, jobs.length),
        total: jobs.length,
        enrichedSoFar: totalEnriched,
        failedSoFar: totalFailed,
      },
      "[workday-td] enrichment batch complete"
    );
  }

  log.info(
    { enriched: totalEnriched, failed: totalFailed, total: jobs.length },
    "[workday-td] description enrichment complete"
  );

  return jobs;
}

/**
 * Enrich one batch of jobs. `concurrency` workers share a queue; each
 * worker drains it sequentially. Per-job errors are logged + counted
 * but do not abort the batch — partial enrichment is fine, the listing
 * already populated the dashboard fields.
 */
async function enrichBatch(
  batch: JobData[],
  detailHeaders: Record<string, string>,
  jobGetUrl: (externalPath: string) => string,
  concurrency: number
): Promise<{ enriched: number; failed: number }> {
  const queue = [...batch];
  let enriched = 0;
  let failed = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
      while (queue.length > 0) {
        const job = queue.shift();
        if (!job) break;
        if (!job.url) continue;
        const externalPath = extractExternalPathFromPublicUrl(job.url);
        if (!externalPath) continue;
        try {
          const detailRes = await fetch(jobGetUrl(externalPath), {
            headers: detailHeaders,
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (!detailRes.ok) {
            throw new Error(`status ${detailRes.status}`);
          }
          const detail = await parseWorkdayJson<WorkdayJobDetailResponse>(
            detailRes,
            TENANT
          );
          const parsed = parseWorkdayJobDetail(detail);
          if (parsed.description_html) {
            job.description_html = parsed.description_html;
            job.description_text =
              parsed.description_text || htmlToText(parsed.description_html);
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
    })
  );
  return { enriched, failed };
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
