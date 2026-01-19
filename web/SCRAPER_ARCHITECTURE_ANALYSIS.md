# Scraper Architecture Analysis

**Date:** 2025-01-20  
**Purpose:** Assess refactoring effort to move browser scrapers to GitHub Actions

---

## Executive Summary

**Refactor Effort: LOW** ✅

The scraping architecture is already well-separated from Next.js HTTP infrastructure. Scrapers are pure functions that can run in any Node.js environment. The main work involves:
1. Creating a GitHub Actions workflow script
2. Updating dependency from `puppeteer-core` + `@sparticuz/chromium` to full `puppeteer`
3. Adding a webhook/queue mechanism to trigger GitHub Actions from Vercel

---

## 1. Scraper Location

### ✅ Well-Abstracted Architecture

**Scrapers live in:** `web/lib/scrapers/`

- **Entry Point:** `lib/scrapers/index.ts` exports `fetchJobs()` function
- **Factory Pattern:** Routes to appropriate scraper based on `atsType`
- **Separation:** Zero coupling to Next.js API routes

**API Routes that use scrapers:**
- `app/api/cron/collect/route.ts` → calls `lib/jobs/runner.ts` → `lib/jobs/processor.ts` → `lib/scrapers/index.ts`
- `app/api/companies/[id]/process/route.ts` → same chain
- `app/api/companies/test/route.ts` → directly calls `fetchJobs()`

**Key Insight:** Scrapers are called through `lib/jobs/processor.ts::runScrapeStage()`, which is a pure function that takes a `Company` object and returns `JobData[]`.

---

## 2. Coupling Analysis

### ✅ Zero HTTP Dependencies

**Scraper Functions:**
- Take simple parameters: `atsType: string`, `atsIdentifier: string`, `careersUrl?: string`
- Return `Promise<JobData[]>` (plain TypeScript types)
- **No** `NextRequest` or `NextResponse` dependencies
- **No** Next.js-specific imports

**Example Function Signature:**
```typescript
export async function fetchJobs(
  atsType: string,
  atsIdentifier: string,
  careersUrl?: string
): Promise<JobData[]>
```

**Can be run from:**
- ✅ Simple Node.js script
- ✅ GitHub Actions workflow
- ✅ Standalone CLI tool
- ✅ Any Node.js runtime

---

## 3. Dependencies

### Current Setup (Vercel Serverless)
```json
{
  "puppeteer-core": "^24.35.0",
  "@sparticuz/chromium": "^143.0.4"
}
```

**Why:** `puppeteer-core` + `@sparticuz/chromium` is optimized for serverless (smaller bundle, pre-compiled Chromium).

### GitHub Actions Setup (Recommended)
```json
{
  "puppeteer": "^24.35.0"
}
```

**Why:** Full `puppeteer` includes Chromium binary, more stable, no size constraints in GitHub Actions.

**Migration Impact:** 
- Update `lib/scrapers/browser.ts` to use `puppeteer` instead of `puppeteer-core` + `@sparticuz/chromium`
- Remove Chromium executable path configuration (Puppeteer handles it automatically)
- **Low effort** - mostly import changes

---

## 4. Database Access

### ✅ Server-Side Service Key Pattern

**Current Implementation:**
```typescript
// lib/supabase/admin.ts
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
```

**Key Points:**
- Uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)
- No browser-side auth dependencies
- No cookie/session management needed
- Works in any Node.js environment

**Usage in Scrapers:**
- Scrapers themselves **don't** access the database directly
- Database access happens in `lib/jobs/processor.ts::runIngestStage()`
- This function also uses `createAdminClient()` - fully portable

---

## 5. Heavy Scrapers (Browser-Based)

### Files Requiring GitHub Actions Migration

#### `lib/scrapers/browser.ts`
**Functions:**
- `scrapeJobsWithBrowser(config: ScraperConfig)` - Generic browser scraper
- `scrapeDayforceWithBrowser(atsIdentifier: string)` - Dayforce-specific
- `scrapeGenericJobBoard(url: string, baseIdentifier: string)` - Fallback for unknown ATS

**Used by:**
- `lib/scrapers/index.ts` → routes browser scraping for:
  - `workday`
  - `smartrecruiters`
  - `bamboohr`
  - `jazzhr`
  - `recruitee`
  - `custom`
  - `dayforce` (fallback when API fails)

**Dependencies:**
- `puppeteer-core` + `@sparticuz/chromium` (needs to change to `puppeteer`)
- `html-to-text` (already portable)

**Timeouts:**
- Page navigation: 30s timeout
- Selector wait: 10s timeout
- Extra wait: 2-3s for dynamic content
- **Total:** Can easily exceed Vercel's 10s Hobby / 60s Pro limits

---

## 6. Light Scrapers (API-Based)

### Files That Can Stay on Vercel

#### `lib/scrapers/lever.ts`
- **Function:** `fetchLeverJobs(atsIdentifier: string)`
- **Method:** REST API (`https://api.lever.co/v0/postings/{identifier}`)
- **Timeout:** 30s (well within Vercel limits)
- **Status:** ✅ Keep on Vercel

#### `lib/scrapers/greenhouse.ts`
- **Function:** `fetchGreenhouseJobs(atsIdentifier: string)`
- **Method:** REST API (`https://boards-api.greenhouse.io/v1/boards/{identifier}/jobs`)
- **Timeout:** 30s
- **Status:** ✅ Keep on Vercel

#### `lib/scrapers/workable.ts`
- **Function:** `fetchWorkableJobs(atsIdentifier: string)`
- **Method:** REST API (`https://apply.workable.com/api/v3/accounts/{identifier}/jobs`)
- **Timeout:** 30s per page (pagination supported)
- **Status:** ✅ Keep on Vercel

#### `lib/scrapers/ashby.ts`
- **Function:** `fetchAshbyJobs(atsIdentifier: string)`
- **Method:** REST API (`https://api.ashbyhq.com/posting-api/job-board/{identifier}`)
- **Timeout:** 30s
- **Status:** ✅ Keep on Vercel

#### `lib/scrapers/dayforce.ts`
- **Function:** `fetchDayforceJobs(atsIdentifier: string)`
- **Method:** Hybrid - tries API first, falls back to browser
- **API Timeout:** 10s per endpoint (tries multiple)
- **Browser Fallback:** Uses `scrapeDayforceWithBrowser()` (heavy)
- **Status:** ⚠️ **Partial** - API calls stay on Vercel, browser fallback goes to GitHub Actions

---

## 7. Architecture Flow

### Current Flow (Vercel)
```
API Route (NextRequest)
  ↓
lib/jobs/runner.ts::executeCollectionJob()
  ↓
lib/jobs/processor.ts::processCollectionTask()
  ↓
lib/jobs/processor.ts::runScrapeStage()
  ↓
lib/scrapers/index.ts::fetchJobs()
  ↓
[Heavy: browser.ts] OR [Light: lever.ts, greenhouse.ts, etc.]
  ↓
lib/jobs/processor.ts::runIngestStage() (writes to Supabase)
```

### Proposed Flow (Hybrid)
```
API Route (Vercel) - Light scrapers
  ↓
lib/scrapers/index.ts::fetchJobs()
  ↓
[Light scrapers only] → Direct to database

API Route (Vercel) - Heavy scrapers
  ↓
Queue job to GitHub Actions (via webhook/queue)
  ↓
GitHub Actions workflow
  ↓
lib/scrapers/index.ts::fetchJobs() (same code!)
  ↓
[Heavy scrapers] → Write results to Supabase
```

---

## 8. Migration Checklist

### Low Effort Tasks ✅

1. **Create GitHub Actions workflow** (`/.github/workflows/scrape-jobs.yml`)
   - Install Node.js + dependencies
   - Run scraper script with company ID
   - Use `puppeteer` instead of `puppeteer-core`

2. **Create standalone scraper script** (`web/scripts/scrape-company.ts`)
   - Accepts company ID as argument
   - Uses `createAdminClient()` for DB access
   - Calls `fetchJobs()` from `lib/scrapers`
   - Writes results via `lib/jobs/processor.ts::runIngestStage()`

3. **Update `lib/scrapers/browser.ts`**
   - Replace `puppeteer-core` + `@sparticuz/chromium` imports
   - Use full `puppeteer` (simpler API)
   - Remove Chromium executable path config

4. **Add webhook/queue mechanism**
   - Option A: GitHub Actions workflow_dispatch (manual trigger)
   - Option B: GitHub API to trigger workflow (from Vercel)
   - Option C: Supabase Queue/Edge Function to trigger GitHub Actions

5. **Update `lib/scrapers/index.ts`**
   - Add flag/env var to route heavy scrapers to GitHub Actions
   - Or: Always route heavy scrapers to queue, light scrapers direct

### Medium Effort Tasks ⚠️

6. **Error handling & retries**
   - GitHub Actions failures need to be tracked
   - Update `job_run_tasks` status from GitHub Actions
   - Consider retry logic in GitHub Actions workflow

7. **Monitoring & logging**
   - GitHub Actions logs need to be accessible
   - Consider storing logs in Supabase or external service

---

## 9. Recommended Approach

### Phase 1: Dual Mode (Minimal Changes)
1. Keep current architecture intact
2. Add GitHub Actions workflow for browser scrapers
3. Update `lib/scrapers/index.ts` to detect heavy scrapers and queue them
4. Light scrapers continue running on Vercel

### Phase 2: Full Migration (Optional)
1. Move all scrapers to GitHub Actions
2. Vercel API routes become thin wrappers that queue jobs
3. Better timeout handling, but more complexity

---

## 10. File Summary

### Heavy Scrapers (Move to GitHub Actions)
- `lib/scrapers/browser.ts` - All browser-based scraping
- Used by: `workday`, `smartrecruiters`, `bamboohr`, `jazzhr`, `recruitee`, `custom`, `dayforce` (fallback)

### Light Scrapers (Keep on Vercel)
- `lib/scrapers/lever.ts` - API-based
- `lib/scrapers/greenhouse.ts` - API-based
- `lib/scrapers/workable.ts` - API-based
- `lib/scrapers/ashby.ts` - API-based
- `lib/scrapers/dayforce.ts` - API-based (primary method)

### Shared Infrastructure (No Changes Needed)
- `lib/scrapers/types.ts` - Type definitions
- `lib/scrapers/utils.ts` - Utility functions
- `lib/scrapers/index.ts` - Factory/router (needs routing logic update)
- `lib/jobs/processor.ts` - Job processing (fully portable)
- `lib/supabase/admin.ts` - Database client (fully portable)

---

## Conclusion

**Refactor Effort: LOW** ✅

The architecture is already well-designed for this migration. Scrapers are pure functions with no HTTP dependencies. The main work is:
1. Creating a GitHub Actions workflow script (~2-3 hours)
2. Updating browser.ts to use `puppeteer` (~30 minutes)
3. Adding routing logic to queue heavy scrapers (~1 hour)

**Total Estimated Time:** 4-5 hours for Phase 1 implementation.
