/**
 * Integration smoke: drive the production Phenom-RBC scraper through the
 * real `fetchJobs("phenom", "rbc", ...)` factory and dump the result for
 * human inspection.
 *
 * Usage (from web/):
 *   npx tsx scripts/smoke-phenom-rbc.ts
 *
 * Output: scripts/artifacts/phenom-rbc-smoke.json
 *
 * What this exercises:
 *   - The real factory dispatch in web/lib/scrapers/index.ts
 *   - The real scraper in web/lib/scrapers/phenom-rbc.ts (pagination over
 *     phApp.eagerLoadRefineSearch + concurrent JSON-LD description
 *     enrichment)
 *   - Browser injection (we hand the factory a locally-launched Chrome so
 *     the script runs reliably on a developer laptop; in prod, GitHub
 *     Actions provides a full-puppeteer Browser via the same injection
 *     point).
 *
 * Cap: forces PHENOM_RBC_MAX_JOBS=5 so a local smoke costs ~30s, not the
 * ~30 minutes a full RBC scrape would. Adjust the constant below if you
 * want more data.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import puppeteer from "puppeteer";
import type { Browser as CoreBrowser } from "puppeteer-core";
import { fetchJobs } from "../lib/scrapers";

const SMOKE_JOB_CAP = 5;
const OUT = resolve(__dirname, "artifacts/phenom-rbc-smoke.json");

async function main(): Promise<void> {
  // Cap the production scraper to a small, fast run.
  process.env.PHENOM_RBC_MAX_JOBS = String(SMOKE_JOB_CAP);

  console.log(`[smoke] launching local Chrome (bundled puppeteer)…`);
  const browser = await puppeteer.launch({ headless: true });

  let error: string | null = null;
  let jobs: Awaited<ReturnType<typeof fetchJobs>> = [];

  try {
    console.log(`[smoke] dispatching fetchJobs("phenom", "rbc", …)`);
    jobs = await fetchJobs(
      "phenom",
      "rbc",
      undefined,
      browser as unknown as CoreBrowser
    );
    console.log(`[smoke] factory returned ${jobs.length} jobs`);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error(`[smoke] fetchJobs failed:`, error);
  } finally {
    await browser.close();
  }

  const payload = {
    ranAt: new Date().toISOString(),
    cap: SMOKE_JOB_CAP,
    error,
    jobCount: jobs.length,
    notes: [
      "Driven through the real fetchJobs(\"phenom\", \"rbc\", …) factory and the production phenom-rbc.ts scraper.",
      "PHENOM_RBC_MAX_JOBS env var caps the scrape; default is 50, this smoke forces 5.",
      "description_text on each job is the FULL extracted text from the per-detail-page JSON-LD JobPosting block.",
    ],
    jobs,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`[smoke] wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
