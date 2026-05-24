/**
 * Scotiabank SuccessFactors Scraper
 *
 * Scrapes job listings from the Scotiabank SuccessFactors career portal
 * (jobs.scotiabank.com). This is a server-side HTML scraper — no browser
 * or JS rendering required since the site returns fully rendered HTML.
 *
 * Used for Tangerine (brand path = "Tangerine") and potentially other
 * Scotiabank sub-brands.
 */

import type { JobData } from "./types";
import { decodeHtmlEntities, detectLocationType, htmlToText } from "./utils";
import { log } from "@/lib/log";

const BASE_URL = "https://jobs.scotiabank.com";

/**
 * Fetch jobs from a Scotiabank SuccessFactors career portal.
 *
 * @param atsIdentifier - The brand path on jobs.scotiabank.com (e.g. "Tangerine")
 */
export async function fetchScotiabankJobs(
  atsIdentifier: string
): Promise<JobData[]> {
  const allJobs: JobData[] = [];
  const seenIds = new Set<string>();
  const pageSize = 25; // SuccessFactors default
  let startRow = 0;
  let totalJobs = Infinity;
  // Page safety + smoke cap. The original 20-page cap silently truncated
  // brands larger than ~500 jobs (Scotia parent has ~1,900). Default
  // raised to 200 (= 5,000-job ceiling, ~2.5× headroom over Scotia parent).
  // `SCOTIABANK_MAX_PAGES=N` overrides for smoke tests.
  const maxPages = resolveMaxPages(process.env.SCOTIABANK_MAX_PAGES);
  let page = 0;

  while (startRow < totalJobs && page < maxPages) {
    page++;
    const url =
      `${BASE_URL}/${atsIdentifier}/search/` +
      `?q=&sortColumn=referencedate&sortDirection=desc&startrow=${startRow}`;

    log.info(`[scotiabank] Fetching page ${page}: startrow=${startRow}`);

    const res = await fetch(url, {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new Error(
        `Scotiabank page error: ${res.status} ${res.statusText}`
      );
    }

    const html = await res.text();

    // Parse total from "Results 1 – 25 of 26".
    if (totalJobs === Infinity) {
      const parsed = extractTotalJobsFromHtml(html);
      if (parsed !== null) {
        totalJobs = parsed;
        log.info(`[scotiabank] Total jobs: ${totalJobs}`);
      }
    }

    // Parse job rows from the HTML table
    const pageJobs = parseJobsFromHtml(html, atsIdentifier, seenIds);

    if (pageJobs.length === 0) {
      // No more jobs on this page
      break;
    }

    allJobs.push(...pageJobs);
    startRow += pageSize;
  }

  log.info(
    `[scotiabank] Scraped ${allJobs.length} jobs for ${atsIdentifier}`
  );

  // Fetch job detail pages to populate description fields.
  // This is required for downstream structure extraction (department/function).
  try {
    const enriched = await enrichScotiabankJobDescriptions(allJobs, 4);
    const withDescriptions = enriched.filter(
      (job) => !!job.description_text && job.description_text.trim().length > 0
    ).length;
    log.info(
      `[scotiabank] Enriched descriptions for ${withDescriptions}/${enriched.length} jobs`
    );
    return enriched;
  } catch (error) {
    log.warn({ err: error }, "[scotiabank] Description enrichment failed, continuing with listing data only:");
    return allJobs;
  }
}

/**
 * Resolve the per-run page cap from an optional env var.
 *
 * Returns 200 by default (5,000-job ceiling, ~2.5× headroom over Scotia
 * parent). A positive integer in `SCOTIABANK_MAX_PAGES` overrides — used by
 * the smoke script (e.g. SCOTIABANK_MAX_PAGES=2 → ~50 jobs, ~10s run).
 * Non-numeric, missing, or zero values fall back to the default.
 *
 * Exported for testing.
 */
export function resolveMaxPages(raw: string | undefined): number {
  if (!raw) return 200;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 200;
  return n;
}

/**
 * Extract the "Results 1 – 25 of N" total count from a listing page.
 *
 * SuccessFactors wraps both sides of the count in `<b>` tags on some brand
 * portals (e.g. the Scotiabank parent brand) but not others (Tangerine).
 * We strip the inline markup first so a single regex handles both.
 *
 * Exported for testing.
 */
export function extractTotalJobsFromHtml(html: string): number | null {
  const flatHeader = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const totalMatch = flatHeader.match(/Results\s+\d+\s*[–-]\s*\d+\s+of\s+(\d+)/);
  return totalMatch ? parseInt(totalMatch[1], 10) : null;
}

/**
 * Parse job listings from SuccessFactors HTML.
 * Extracts data from the server-rendered table rows.
 *
 * Exported for testing — production callers should use `fetchScotiabankJobs`.
 */
export function parseJobsFromHtml(
  html: string,
  brandPath: string,
  seenIds: Set<string>
): JobData[] {
  const jobs: JobData[] = [];

  // Match table rows that contain job data
  // Pattern: <tr class="data-row ..."> ... </tr>
  const rowRegex = /<tr\s+class="data-row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  // The brand-path prefix in job hrefs is OPTIONAL: Tangerine includes it
  // (`/Tangerine/job/...`), the Scotiabank parent brand omits it
  // (`/job/...`). Match both shapes with a non-capturing optional group so
  // a single parser handles every Scotiabank SuccessFactors brand.
  const hrefPrefix = `(?:/${escapeRegex(brandPath)})?/job/`;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // Extract job link, title, and ID
    // Pattern: <a href="/Tangerine/job/Toronto-.../598714517/" title="Mobile Architect">
    const linkRegex = new RegExp(
      `<a[^>]*href="(${hrefPrefix}[^"]+/(\\d+)/?)"[^>]*title="([^"]*)"`,
      "i"
    );
    const linkMatch = linkRegex.exec(rowHtml);

    if (!linkMatch) {
      // Try alternate pattern: title in the link text instead of attribute
      const altLinkRegex = new RegExp(
        `<a[^>]*href="(${hrefPrefix}[^"]+/(\\d+)/?)"[^>]*>([^<]+)</a>`,
        "i"
      );
      const altMatch = altLinkRegex.exec(rowHtml);
      if (!altMatch) continue;

      const [, path, jobId, title] = altMatch;
      if (seenIds.has(jobId)) continue;
      seenIds.add(jobId);

      const jobData = buildJobData(jobId, decodeHtmlEntities(title.trim()), path, rowHtml);
      if (jobData) jobs.push(jobData);
      continue;
    }

    const [, path, jobId, title] = linkMatch;
    if (seenIds.has(jobId)) continue;
    seenIds.add(jobId);

    const jobData = buildJobData(jobId, decodeHtmlEntities(title), path, rowHtml);
    if (jobData) jobs.push(jobData);
  }

  return jobs;
}

/**
 * Build a JobData object from parsed HTML data.
 */
function buildJobData(
  jobId: string,
  title: string,
  path: string,
  rowHtml: string
): JobData | null {
  if (!title || title.length < 3) return null;

  const url = `${BASE_URL}${path}`;

  // Extract location from <span class="jobLocation">Toronto, ON, CA, M2H0A1</span>
  const locMatch = rowHtml.match(
    /<span\s+class="jobLocation">\s*([\s\S]*?)\s*<\/span>/i
  );
  let location: string | null = null;
  if (locMatch) {
    location = locMatch[1]
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    // Clean up postal codes at the end (e.g., "Toronto, ON, CA, M2H0A1" -> "Toronto, ON, CA")
    location = location.replace(/,\s*[A-Z]\d[A-Z]\s*\d[A-Z]\d\s*$/, "").trim();
    if (!location) location = null;
  }

  // Extract date from <span class="jobDate">Feb 7, 2026</span>
  const dateMatch = rowHtml.match(
    /<span\s+class="jobDate">\s*([^<]+)\s*<\/span>/i
  );
  let postedDate: Date | null = null;
  if (dateMatch) {
    const dateStr = dateMatch[1].trim();
    try {
      postedDate = new Date(dateStr);
      if (isNaN(postedDate.getTime())) postedDate = null;
    } catch {
      postedDate = null;
    }
  }

  return {
    external_id: jobId,
    title,
    department: null,
    team: null,
    location,
    location_type: detectLocationType(location || "", ""),
    description_html: null,
    description_text: null,
    commitment: "full-time",
    posted_date: postedDate,
    url,
  };
}

// `decodeHtmlEntities` moved to `./utils` (had a real bug here — `&amp;`
// was being decoded FIRST, which meant doubly-encoded sequences like
// `&amp;lt;` were collapsing to `<` instead of staying as `&lt;`. The
// canonical version in `./utils` decodes `&amp;` last.).

/** Escape a string for use in a RegExp */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Optionally fetch full job descriptions by visiting each job detail page.
 * Call this after fetchScotiabankJobs if you need descriptions.
 *
 * @param jobs - Jobs from fetchScotiabankJobs
 * @param concurrency - Number of parallel requests (default: 3)
 */
export async function enrichScotiabankJobDescriptions(
  jobs: JobData[],
  concurrency = 3
): Promise<JobData[]> {
  const enriched: JobData[] = [];

  // Process in batches
  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (job) => {
        if (!job.url) return job;

        try {
          const res = await fetch(job.url, {
            headers: {
              Accept: "text/html",
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            },
            signal: AbortSignal.timeout(15000),
          });

          if (!res.ok) return job;

          const html = await res.text();

          // Extract job description from the detail page.
          // SuccessFactors pages commonly render description in a span with
          // itemprop="description" and nested span tags.
          const descHtml = extractScotiabankDescriptionHtml(html);
          if (descHtml) {
            return {
              ...job,
              description_html: descHtml,
              description_text: htmlToText(descHtml),
            };
          }

          return job;
        } catch {
          // Failed to fetch description, return job as-is
          return job;
        }
      })
    );

    for (const result of results) {
      enriched.push(
        result.status === "fulfilled" ? result.value : batch[enriched.length - i]
      );
    }
  }

  return enriched;
}

/** Exported for testing. */
export function extractScotiabankDescriptionHtml(html: string): string | null {
  const descriptionByItemprop = extractBalancedSpanInnerHtml(
    html,
    /<span[^>]*itemprop="description"[^>]*>/i
  );
  if (descriptionByItemprop) {
    return descriptionByItemprop.replace(/<img[^>]*>/gi, "").trim();
  }

  const descriptionByClass = extractBalancedSpanInnerHtml(
    html,
    /<span[^>]*class="[^"]*jobdescription[^"]*"[^>]*>/i
  );
  if (descriptionByClass) {
    return descriptionByClass.replace(/<img[^>]*>/gi, "").trim();
  }

  return null;
}

function extractBalancedSpanInnerHtml(
  html: string,
  openingSpanRegex: RegExp
): string | null {
  const openingMatch = openingSpanRegex.exec(html);
  if (!openingMatch || openingMatch.index < 0) return null;

  const openingIndex = openingMatch.index;
  const openingTagEnd = html.indexOf(">", openingIndex);
  if (openingTagEnd < 0) return null;

  const spanTagRegex = /<span\b[^>]*>|<\/span>/gi;
  spanTagRegex.lastIndex = openingTagEnd + 1;

  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = spanTagRegex.exec(html)) !== null) {
    if (match[0].startsWith("</span")) {
      depth -= 1;
    } else {
      depth += 1;
    }

    if (depth === 0) {
      return html.slice(openingTagEnd + 1, match.index);
    }
  }

  return null;
}
