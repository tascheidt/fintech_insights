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
- **`phenom-rbc.ts`** — RBC's Phenom CareerConnect tenant (`jobs.rbc.com`). Reads server-rendered `phApp.eagerLoadRefineSearch` + JSON-LD `JobPosting` per detail page. Chunked enrichment (50/batch, concurrency=4). Navigation uses `waitUntil: "domcontentloaded"` — **never** `networkidle2`: with ~1,400 detail page-loads, the old `networkidle2` + multi-second settle ran ~50 min and the `scrape-heavy.yml` ceiling killed every run for a week (June 2026); the SSR read lands the full corpus in ~12-15 min. **Do not reintroduce `networkidle2`.** Two later corrections (June 2026): (1) the JSON-LD is server-rendered for *most* reqs but a consistent ~36% rendered it slightly later (or client-side), and the old fixed **400ms** settle missed them — leaving ~515 active reqs teaser-only on every scrape. So the detail read now POLLS the extractor (`waitForFunction`, 3s cap, 300ms) instead of a fixed settle: already-rendered pages resolve on the first poll (no slowdown), late pages resolve when ready, dead pages time out cheaply. This is a *targeted hydration poll*, not a return to `networkidle2`. (2) The JSON-LD extractor is broadened to handle `@graph` / array-`@type` shapes. (3) Reqs the Phenom pass still can't fill fall through to a **Workday CXS fallback** (RBC's `applyUrl` routes into a Workday tenant; `parseWorkdayApplyUrl` derives the CXS detail endpoint, same reliable surface as TD/CIBC). The fallback is a no-op for any req whose applyUrl isn't a Workday URL. Phenom stays *primary* here (it works for the majority), the inverse of phenom-bmo where Workday is primary.
- **`phenom-bmo.ts`** — BMO's Phenom tenant (`jobs.bmo.com`), but a **hybrid**: Phenom for the listing, **Workday for descriptions**. BMO uses Phenom only as a careers *frontend* — its job content lives in a Workday tenant (`bmo.wd3.myworkdayjobs.com`), and every Phenom listing row's `applyUrl` routes there. Crucially, BMO does **not** server-render the full JSON-LD `JobPosting` into its Phenom detail HTML the way RBC does, so the RBC-style detail extractor returned null for ~99% of BMO postings and `description_html` was empty corpus-wide (June 2026 incident — 1,091/1,104 jobs teaser-only). Waiting longer (`networkidle2`) didn't help; the description isn't on that surface to wait for. Fix: enrich descriptions **primarily from Workday's CXS JSON endpoint** (derived per-job from `applyUrl` via `deriveBmoWorkdayDetailUrl`, reusing the `workday-utils` helpers — the same surface that gives TD/CIBC 0 null descriptions; a single warm-up POST seeds the Akamai cookie). The Phenom JSON-LD detail page is kept as a per-job **fallback** (hydration-aware `domcontentloaded` + `waitForFunction` poll; extractor broadened to handle `@graph`/array `@type`) for anything Workday can't fill. The listing pass still uses Phenom because it carries richer taxonomy (department/team) than Workday's listing. A total Workday block degrades to the Phenom fallback rather than discarding the run. **Don't "re-mirror" this onto phenom-rbc** — RBC's detail surface genuinely is server-rendered JSON-LD; only BMO needs the Workday detour.
- **`browser.ts`** — Generic Puppeteer helpers (`scrapeJobsWithBrowser`, `scrapeGenericJobBoard`, `scrapeSuccessFactors`).

## Avature scrapers (offloaded to GitHub Actions)

Avature CRM is a different vendor from Phenom; the white-labelled pages render plain HTML (no `phApp`, no JSON-LD JobPosting), so the parsing strategy is HTML-string-in → DOM-out via jsdom/DOMParser. Same `scrape-heavy.yml` offload path as the Phenom scrapers.

- **`avature-bnc.ts`** — National Bank's Avature CRM tenant (`emplois.bnc.ca`). Listing pagination via `?jobOffset=N` with stride 20 (Avature's `jobRecordsPerPage` cap); detail descriptions concatenated from every `article__content__view__field__value` under the `.main-panel` container, excluding the metadata-only first block. Chunked enrichment (50/batch, concurrency=4).

## Offloaded API scrapers — Workday tenants

Workday exposes a documented JSON POST endpoint (`/wday/cxs/<tenant>/<site>/jobs`) so these are HTTP fetch-based, not Puppeteer. They are nonetheless **offloaded to GitHub Actions** (see `isBrowserScraper` in `index.ts`) because a cold ~1,500-job scrape with per-job description GETs exceeds Vercel's 300s function budget. `AbortSignal.timeout(15_000)` on every fetch; non-2xx throws (no in-code retry — the daily cron is the retry).

- **`workday-utils.ts`** — pure shared helpers: `buildWorkdayUrls`, `parseWorkdayListingRow`, `parseWorkdayJobDetail`, `resolveWorkdayJobCap`, and `parseWorkdayApplyUrl` (maps a Phenom listing row's Workday `applyUrl` → CXS detail/listing endpoints + tenant/instance/site; tenant-agnostic, used by the phenom-bmo / phenom-rbc Workday enrichment). Also exports `parseWorkdayJson` + `isAkamaiHtmlBlock` + `WorkdayBlockedError` (Akamai 200-with-HTML detection — see the gotcha below) and `buildWorkdayHeaders` + `extractCookieJar` (defensive — not required for current tenants but harmless if Akamai posture tightens). Used by every tenant-specific Workday scraper. Intentionally NOT a base class — fork-per-tenant.
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

- **`revolut.ts`** — anchors on `JOB_ANCHOR_SELECTOR` = `a[href*="/careers/position/"]` (substring `*=`, **not** prefix `^=`) and uses the trailing UUID as `external_id`. Two markup facts the scraper shipped wrong on (June 2026), each of which silently returned 0 jobs for weeks:
  1. **Job hrefs carry a locale prefix** — `/en-US/careers/position/<slug>-<uuid>/`, not `/careers/position/...`. The original `^=` selector matched nothing on the live page. `*=` is locale-agnostic; `extractExternalId` reads the trailing UUID regardless of prefix. The `waitForSelector` and the parser MUST share `JOB_ANCHOR_SELECTOR` — a drift between them is what masked the bug.
  2. **Large filters lazy-load.** The page server-renders the full anchor set only for *small* filters. Canada (3 roles) emits all 3; the unfiltered board (~678) emits just a ~6-item "Featured roles" subset and loads the rest on scroll. We scrape a country filter (Canada), which stays small — a single load + `waitForSelector` captures everything. If a filter outgrows the featured cap the scraper warns (parsed < page-reported count); it would then need a scroll/pagination pass.
- **Genuinely-empty vs failed-load disambiguation.** A 0-anchor page is ambiguous — Cloudflare challenge, redirect, markup drift, *or* a legitimately empty filter — and the old code reported all of them as "0 jobs, success." `fetchRevolutJobs` now reads Revolut's own counters ("We have N open positions" global + "Search from N open positions" filtered) and `assessListing` decides: 0 parsed with no counters at all → `unrendered`; 0 parsed while the filter reports N>0 → `selector-drift`; both throw a typed `RevolutScrapeError` so the task fails loudly and `scrape-heavy.yml`'s `scrape-retry` re-runs on a fresh runner (mirrors `WorkdayBlockedError`). 0 parsed while the filter reports 0 → legitimately empty, returns `[]`. Note: an **unrecognised `?city=` value is ignored** by Revolut (it returns the full board, not an empty state) — don't treat a bogus filter as "0 results". Pure helpers (`parseListingPage`, `parseListingCounts`, `assessListing`, `isCanadianLocation`, `extractExternalId`, `mapRevolutJob`) are unit-tested in `revolut.test.ts`. Cloudflare passes from a GH Actions runner IP but typically blocks local-dev Puppeteer; debug against the workflow.
- **Canadian-market guard — never trust the server `?city=` filter alone.** Location filtering is meant to happen server-side via `?city=Canada`, but that filter is **silently ignored** when Revolut stops recognising the value: it returns the *full global board*, not an empty state. On June 8 2026 `?city=Canada` stopped narrowing and the scraper ingested Revolut's six global "Featured roles" (London / Dubai·Lisbon / Netherlands / UAE / Krakow / Tokyo) under Revolut Canada, silently flipping the three real Canadian roles to inactive. Fix: every parsed row is now independently checked with `isCanadianLocation` (exported, unit-tested) and anything not *clearly* Canadian is dropped. If the board renders roles but **none** are Canadian, `fetchRevolutJobs` throws `RevolutScrapeError("filter-ignored")` — failing loudly + triggering `scrape-retry` rather than ingesting the wrong market or silently returning zero. The matcher is conservative (Canada/Canadian + provinces + unambiguous cities; "London"/"Victoria"/"Hamilton" are excluded so a London-UK role can't read as Canadian) and is **Canada-specific** — a new Revolut-country tenant needs its own market matcher, not just a `careers_url` swap.
- **Description enrichment.** After the listing parse, each job's detail page is visited (sequentially, reusing the Cloudflare-cleared page so the challenge isn't re-triggered — fine for a country-filtered tenant's single-digit corpus) and its description extracted via `REVOLUT_DETAIL_EXTRACTOR_SRC`: JSON-LD `JobPosting` → Next.js `__NEXT_DATA__` (the strategy that actually hits today — Revolut emits no JSON-LD JobPosting) → largest `<main>`/`<article>` fallback. Best-effort per job (try/catch); a miss leaves that row's description null but never fails the run. **This is load-bearing for categorization, not cosmetic:** without a description the hot-path Flash extractor (`processor.ts` → `extractAndUpdateStructure`, gated on a non-empty description) is skipped, so `function_category` / `seniority_level` / `standardized_department` stay null and the job ingests uncategorised — it then counts in the Competitive Matrix Total but lands in no function-group column. If a Revolut tenant ever outgrows the server-rendered set (see lazy-load note above), enrichment still works per-job but the listing parse would miss the lazy-loaded roles.

Tenants today: **Revolut Canada** — `slug: revolut-canada`, `ats_type: revolut`, `careers_url: https://www.revolut.com/en-US/careers/?city=Canada`. The `?city=` param is a server-side *hint*, but it can't be trusted on its own (see the Canadian-market guard above), so the authoritative filter is the client-side `isCanadianLocation` check. A new Revolut-Country tenant therefore needs more than a `careers_url` swap — it needs its own market matcher; the current guard is Canada-only and will throw `filter-ignored` on any board whose roles aren't Canadian.

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
