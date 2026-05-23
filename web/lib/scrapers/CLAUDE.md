# `web/lib/scrapers` — agent context

ATS scrapers used by the Next.js side of the pipeline. The Python side has its own scrapers in `src/scrapers/`; that's the legacy CLI flow.

Entry point: `fetchJobs(atsType, atsIdentifier, careersUrl?, browser?)` in `index.ts`.

## API scrapers (run inline, cheap)

These hit the ATS provider's JSON endpoint. They run inside Vercel functions and complete fast.

- **`lever.ts`** — Lever boards.
- **`greenhouse.ts`** — Greenhouse boards.
- **`workable.ts`** — Workable boards.
- **`ashby.ts`** — Ashby boards.

## Browser scrapers (offloaded to GitHub Actions)

These need Puppeteer because the ATS doesn't expose a clean JSON feed. They are too long-running / memory-heavy to run reliably inside a Vercel cron, so the live flow offloads them via `triggerScrapeWorkflow` in `web/lib/github.ts`, which `workflow_dispatch`-es `.github/workflows/scrape-heavy.yml`.

- **`dayforce.ts`** — Dayforce boards.
- **`scotiabank.ts`** — Scotiabank custom careers site.
- **`phenom-rbc.ts`** — RBC's Phenom CareerConnect tenant (`jobs.rbc.com`). Reads server-rendered `phApp.eagerLoadRefineSearch` + JSON-LD `JobPosting` per detail page. Chunked enrichment (50/batch, concurrency=4).
- **`phenom-bmo.ts`** — BMO's Phenom tenant (`jobs.bmo.com`). Same shape as phenom-rbc.
- **`phenom-bnc.ts`** — National Bank's Phenom tenant (white-labelled `emplois.bnc.ca`). Same shape.
- **`browser.ts`** — Generic Puppeteer helpers (`scrapeJobsWithBrowser`, `scrapeGenericJobBoard`, `scrapeSuccessFactors`).

## Offloaded API scrapers — Workday tenants

Workday exposes a documented JSON POST endpoint (`/wday/cxs/<tenant>/<site>/jobs`) so these are HTTP fetch-based, not Puppeteer. They are nonetheless **offloaded to GitHub Actions** (see `isBrowserScraper` in `index.ts`) because a cold ~1,500-job scrape with per-job description GETs exceeds Vercel's 300s function budget. `AbortSignal.timeout(15_000)` on every fetch; non-2xx throws (no in-code retry — the daily cron is the retry).

- **`workday-utils.ts`** — pure shared helpers: `buildWorkdayUrls`, `parseWorkdayListingRow`, `parseWorkdayJobDetail`, `resolveWorkdayJobCap`. Used by every tenant-specific Workday scraper. Intentionally NOT a base class — fork-per-tenant.
- **`workday-td.ts`** — TD Bank (`td.wd3.myworkdayjobs.com/en-US/TD_Bank_Careers`).
- **`workday-cibc.ts`** — CIBC (`cibc.wd3.myworkdayjobs.com/search`). Also exports `isSimpliiPosting` — a Simplii-Financial classifier currently running in **log-only mode**. The companies row for Simplii and the `companySlugOverride` routing land in a follow-up after production logs confirm Simplii postings actually surface in CIBC's Workday.

### `browser.ts` is 1131 LOC — leave it alone pre-launch

Resist the urge to refactor `browser.ts` before launch. It works. The complexity is load-bearing — selector heuristics, retry logic, and per-site quirks are baked in. Post-launch, split it by site and add tests; before launch, do not.

## ATS detection

- **`detect-ats.ts`** — `detectATSFromUrl` infers the ATS type from a careers URL. Used by the company-onboarding flow.

## Shared

- **`types.ts`** — `JobData` shape and `jobToRow` mapper to the DB row.
- **`utils.ts`** — Shared HTML/text helpers.
- **`index.ts`** — Factory + re-exports.

## Adding a new ATS

1. Decide: API or browser-based?
2. Create the file (`web/lib/scrapers/<name>.ts`) implementing the shared `JobData` shape.
3. Add a `case "<name>":` to `fetchJobs` in `index.ts`.
4. If browser-based, route through `scrape-heavy.yml` — do **not** add a new browser scrape on the Vercel hot path.
5. Add the company config (see `config/companies.yaml` for the Python side; `web/lib/scrapers/detect-ats.ts` for the web side).
6. Update this file with a one-line description of the new scraper.
