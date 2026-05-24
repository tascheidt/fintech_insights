/**
 * Integration smoke: drive the production Scotiabank SuccessFactors
 * scraper through `fetchJobs("scotiabank", "Scotiabank", …)` and dump the
 * result for human inspection.
 *
 * Usage (from web/):
 *   npx tsx scripts/smoke-scotiabank.ts
 *
 * Output: scripts/artifacts/scotiabank-smoke.json
 *
 * What this exercises:
 *   - The real factory dispatch in web/lib/scrapers/index.ts
 *   - The real scraper in web/lib/scrapers/scotiabank.ts (pagination over
 *     /Scotiabank/search?startrow= + concurrent detail-page description
 *     enrichment via extractScotiabankDescriptionHtml)
 *   - The optional brand-path prefix in job hrefs (Scotia parent omits it;
 *     Tangerine includes it — same parser handles both)
 *
 * Cap: forces SCOTIABANK_MAX_PAGES=2 so a local smoke pulls ~50 jobs in
 * ~30s, not the ~1,900 jobs / several minutes a full parent scrape would.
 * The env var is an optional cap — unset (the production default) the
 * scraper paginates to the corpus total.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fetchJobs } from "../lib/scrapers";

const SMOKE_MAX_PAGES = 2; // ~50 jobs
const OUT = resolve(__dirname, "artifacts/scotiabank-smoke.json");

async function main(): Promise<void> {
  // Cap the production scraper to a small, fast run.
  process.env.SCOTIABANK_MAX_PAGES = String(SMOKE_MAX_PAGES);

  let error: string | null = null;
  let jobs: Awaited<ReturnType<typeof fetchJobs>> = [];

  try {
    console.log(`[smoke] dispatching fetchJobs("scotiabank", "Scotiabank", …)`);
    // Pass undefined for browser — the Scotiabank scraper is server-HTML,
    // no Puppeteer required.
    jobs = await fetchJobs(
      "scotiabank",
      "Scotiabank",
      undefined,
      undefined
    );
    console.log(`[smoke] factory returned ${jobs.length} jobs`);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error(`[smoke] fetchJobs failed:`, error);
  }

  // Quality stats: how many got descriptions?
  const withDescriptions = jobs.filter(
    (j) => !!j.description_text && j.description_text.trim().length > 0
  ).length;
  const withLocation = jobs.filter((j) => !!j.location).length;
  const withPostedDate = jobs.filter((j) => !!j.posted_date).length;

  const payload = {
    ranAt: new Date().toISOString(),
    maxPages: SMOKE_MAX_PAGES,
    error,
    jobCount: jobs.length,
    withDescriptions,
    withLocation,
    withPostedDate,
    notes: [
      "Driven through the real fetchJobs(\"scotiabank\", \"Scotiabank\", …) factory and the production scotiabank.ts scraper.",
      "SCOTIABANK_MAX_PAGES is an optional cap; unset = full corpus, this smoke forces 2 (~50 jobs).",
      "description_text on each job is the FULL extracted text from the per-detail-page itemprop=\"description\" span.",
    ],
    jobs,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`[smoke] wrote ${OUT}`);
  console.log(
    `[smoke] descriptions: ${withDescriptions}/${jobs.length}, locations: ${withLocation}/${jobs.length}, dates: ${withPostedDate}/${jobs.length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
