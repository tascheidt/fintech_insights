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
- **`scotiabank.ts`** — Scotiabank SuccessFactors portal (`jobs.scotiabank.com`). One parser drives every Scotia-family brand: the parent **Scotiabank** brand (incumbent, ~1,900 jobs, hrefs omit the brand prefix) and **Tangerine** (fintech subsidiary, ~30 jobs, hrefs include `/Tangerine/`). The brand-path prefix in hrefs is matched as an optional regex group so both shapes work. `SCOTIABANK_MAX_PAGES` env caps per-run pagination (default 200 = 5,000-job ceiling). Offloaded to `scrape-heavy.yml` for the parent — 1,900 jobs × per-page + per-detail fetches don't fit in Vercel's 300s budget.
- **`phenom-rbc.ts`** — RBC's Phenom CareerConnect tenant (`jobs.rbc.com`). Reads server-rendered `phApp.eagerLoadRefineSearch` + JSON-LD `JobPosting` per detail page. Chunked enrichment (50/batch, concurrency=4). Both the listing and detail surfaces are in the *initial* HTML response (confirmed by `curl`), so navigation uses `waitUntil: "domcontentloaded"` — **not** `networkidle2`. This matters: with ~1,400 detail page-loads, the old `networkidle2` + multi-second settle ran ~50 min and the `scrape-heavy.yml` 30-min ceiling killed every run for a week (June 2026); the SSR read lands the full corpus in ~12-15 min. Don't reintroduce a hydration wait here — there's nothing client-rendered to wait for.
- **`phenom-bmo.ts`** — BMO's Phenom tenant (`jobs.bmo.com`). Same shape as phenom-rbc.
- **`browser.ts`** — Generic Puppeteer helpers (`scrapeJobsWithBrowser`, `scrapeGenericJobBoard`, `scrapeSuccessFactors`).

## Avature scrapers (offloaded to GitHub Actions)

Avature CRM is a different vendor from Phenom; the white-labelled pages render plain HTML (no `phApp`, no JSON-LD JobPosting), so the parsing strategy is HTML-string-in → DOM-out via jsdom/DOMParser. Same `scrape-heavy.yml` offload path as the Phenom scrapers.

- **`avature-bnc.ts`** — National Bank's Avature CRM tenant (`emplois.bnc.ca`). Listing pagination via `?jobOffset=N` with stride 20 (Avature's `jobRecordsPerPage` cap); detail descriptions concatenated from every `article__content__view__field__value` under the `.main-panel` container, excluding the metadata-only first block. Chunked enrichment (50/batch, concurrency=4).

## Offloaded API scrapers — Workday tenants

Workday exposes a documented JSON POST endpoint (`/wday/cxs/<tenant>/<site>/jobs`) so these are HTTP fetch-based, not Puppeteer. They are nonetheless **offloaded to GitHub Actions** (see `isBrowserScraper` in `index.ts`) because a cold ~1,500-job scrape with per-job description GETs exceeds Vercel's 300s function budget. `AbortSignal.timeout(15_000)` on every fetch; non-2xx throws (no in-code retry — the daily cron is the retry).

- **`workday-utils.ts`** — pure shared helpers: `buildWorkdayUrls`, `parseWorkdayListingRow`, `parseWorkdayJobDetail`, `resolveWorkdayJobCap`. Also exports `parseWorkdayJson` + `isAkamaiHtmlBlock` + `WorkdayBlockedError` (Akamai 200-with-HTML detection — see the gotcha below) and `buildWorkdayHeaders` + `extractCookieJar` (defensive — not required for current tenants but harmless if Akamai posture tightens). Used by every tenant-specific Workday scraper. Intentionally NOT a base class — fork-per-tenant.
- **`workday-td.ts`** — TD Bank (`td.wd3.myworkdayjobs.com/en-US/TD_Bank_Careers`). Chunked enrichment (50/batch, concurrency=4, tunable via `WORKDAY_TD_CONCURRENCY` env). Replaced the prior sequential loop after the May 28 2026 incident — a ~18 min description tail left the script exposed to transient Supabase recoveries mid-ingest. Workday's Akamai surface tolerates this concurrency level; sibling tenants (Phenom, Avature) run the same 50/4 shape.
- **`workday-cibc.ts`** — CIBC (`cibc.wd3.myworkdayjobs.com/search`). Sequential enrichment (smaller corpus, ~500 jobs). Also exports `isSimpliiPosting` — a live Simplii-Financial classifier that routes a job to the Simplii sub-brand (`companySlugOverride: 'simplii'`) when the **title** matches `/\bsimplii\b/i` OR the **description** contains 2+ "simplii" mentions; everything else stays CIBC. Runs after description enrichment so the description is available. The earlier blind all-fields walk was removed after it mass-mis-tagged CIBC jobs as Simplii (May 2026).

### Workday URL gotcha (read this before changing `buildWorkdayUrls`)

Workday returns `externalPath` already prefixed with `/job/...`. The detail URL builder MUST append it verbatim — do NOT prepend another `/job` or every detail GET returns 406. The May 2026 incident shipped that bug for a week and the misdiagnosis ("Akamai bot-detection") cost a 60-line cookie/header machine that was never the fix. **When debugging a Workday detail `406`, the first move is `curl` against the constructed URL — not adding headers.**

### Two different Workday failures — do not conflate them

There are two unrelated ways a Workday scrape "fails to get JSON," and the fix for one is the wrong move for the other:

- **`406 Not Acceptable` on a detail GET** → a **URL bug** (the `/job/job/` doubling above). `curl` the constructed URL; fix the builder. NOT bot-detection. NOT solved by headers/cookies.
- **`200 OK` whose body is HTML** (`<!DOCTYPE …`) on the **listing POST** → a **real Akamai block**: the runner's datacenter egress IP is greylisted, so a `200` carries a challenge page instead of JSON. `res.ok` is `true`, so the old code sailed past the status guard and `JSON.parse` threw an opaque `Unexpected token '<'`. This is detected by `parseWorkdayJson` / `isAkamaiHtmlBlock`, which throw a typed `WorkdayBlockedError` so the `job_run_tasks` row reads legibly. **The fix is a fresh runner IP, not headers/cookies** — the greylist holds for the whole run, so in-process retry on the same IP is useless. The June 2026 incident: CIBC + TD both blocked on the first POST at 06:46; a manual re-trigger landed the full 511 + 1,437 corpus minutes later on a different runner. `scrape-heavy.yml` now has a `scrape-retry` job (`needs: scrape`, `if: failure()`) that re-runs once on a fresh runner automatically. How to tell them apart in one step: `curl` the endpoint from your own machine — clean JSON means the URL/shape is fine and the block is IP-level (residential IP isn't greylisted); an error means it's a code/URL problem.

### `browser.ts` is 1131 LOC — leave it alone pre-launch

Resist the urge to refactor `browser.ts` before launch. It works. The complexity is load-bearing — selector heuristics, retry logic, and per-site quirks are baked in. Post-launch, split it by site and add tests; before launch, do not.

### Heavy-scrape write resilience (`web/scripts/scrape-heavy.ts`)

The offloaded runner fetches the whole corpus in memory, then writes. Two write hazards have repeatedly stranded the big banks (1.4–1.9k jobs) *after* a clean fetch+enrich:

- **The `scraped_data` snapshot is a 12–17MB single JSONB write.** It deterministically blows Supabase's 8s `statement_timeout` (`57014`) for RBC/Scotia/TD and sometimes trips a gateway `520/521`. It is **best-effort only** — written outside the transient-retry and wrapped in try/catch — because the only reader is the rare `startFromStage:'ingest'` resume; Step 8 ingests from the in-memory corpus regardless. **Never make this write fatal again** (it aborted Scotia & TD for days, June 2026). The per-row ingest writes, by contrast, are small and *are* retried.
- **Error serialization:** supabase-js rejects with a plain `{code,message}` object, not an `Error`. Use `describeError()` (never `String(err)`) when writing `error_message` — `String({...})` is `"[object Object]"`, which masked the real `57014`/`520` causes in the task row for days.
- **`isTransientDbError` is the allow-list of retry-worthy failures**: PGRST002/001 (schema-cache reload), `57014`/`55P03` (statement/lock timeout under contention), raw transport errors, and Cloudflare gateway 5xx (`520`–`524`) in front of the Supabase origin. A deterministic timeout (the oversized snapshot write) is *not* something retry should hide — it's fixed by not doing the oversized write, not by retrying it.

## Revolut (offloaded to GitHub Actions)

Revolut's careers page is a custom-built Next.js SPA behind Cloudflare anti-bot. Not on any third-party ATS (probed Smartrecruiters / Lever / Greenhouse / Workable — all return 404 or empty for any Revolut slug variant). The generic `scrapeGenericJobBoard` drops every job because Revolut URLs are slug+UUID (`/careers/position/head-of-risk-257ab149-12e7-4a84-bda0-1ab1a1d36760/`), not `/jobs/<digits>` as the generic ID-extraction regex requires.

- **`revolut.ts`** — anchors on `a[href^="/careers/position/"]` and uses the trailing UUID as `external_id`. Listing is server-rendered on first response (no client-side pagination), so a single page load + `waitForSelector` is enough. Description enrichment is deferred to a follow-up (the hot path tolerates null descriptions). Cloudflare passes from a GH Actions runner IP but typically blocks local-dev Puppeteer; debug against the workflow.

Tenants today: **Revolut Canada** — `slug: revolut-canada`, `ats_type: revolut`, `careers_url: https://www.revolut.com/en-US/careers/?city=Canada`. Location filtering happens server-side via the `?city=` query param, so the same scraper handles any Revolut-Country tenant by changing only the company row's `careers_url`.

## Generic custom scrapers (offloaded to GitHub Actions)

Companies with `ats_type: custom` use the generic Puppeteer scraper (`scrapeGenericJobBoard` from `browser.ts`). They are offloaded to GitHub Actions via `isBrowserScraper`. Use this only for sites whose URLs contain a numeric job ID (the generic ID extractor requires `\d+`) — slug-based custom careers pages need a dedicated scraper modeled on `revolut.ts`.

## ATS detection

- **`detect-ats.ts`** — `detectATSFromUrl` infers the ATS type from a careers URL. Used by the company-onboarding flow.

## Shared

- **`types.ts`** — `JobData` shape and `jobToRow` mapper to the DB row.
- **`utils.ts`** — Shared HTML/text helpers.
- **`index.ts`** — Factory + re-exports.

## Adding a new ATS

0. **Verify the ATS against live HTML before assuming.** Don't trust pattern-matching from a sibling brand — `curl` the careers URL, grep for known markers: `phApp` / `eagerLoadRefineSearch` → Phenom, `data-avaturetemplate` / `avacdn.net` → Avature, `wd[0-9]+.myworkdayjobs.com` → Workday, `boards.greenhouse.io` → Greenhouse, etc. The parent corporate brand tells you nothing — BNC was on Avature while its sibling RBC was on Phenom (May 2026).
1. Decide: API or browser-based?
2. **Probe the documented endpoint with `curl` before writing parser code.** Confirm the response shape, status codes, and any required headers. If something looks like bot-detection (406/403), `curl` with the *simplest possible* headers FIRST — if it works, it's not bot-detection. Unit tests on fixtures don't catch URL-shape bugs (the May 2026 Workday `/job/job/` doubling shipped because the test pinned the buggy URL).
3. Create the file (`web/lib/scrapers/<name>.ts`) implementing the shared `JobData` shape.
4. Add a `case "<name>":` to `fetchJobs` in `index.ts`.
5. If browser-based, route through `scrape-heavy.yml` — do **not** add a new browser scrape on the Vercel hot path.
6. Add the company config (see `config/companies.yaml` for the Python side; `web/lib/scrapers/detect-ats.ts` for the web side).
7. Update this file with a one-line description of the new scraper.
