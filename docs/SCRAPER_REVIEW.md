# Scraper Setup Review - Pre-Testing Checklist

This document provides a comprehensive review of the browser scraping implementation for GitHub Actions, including all components, potential issues, and verification steps.

## ✅ Implementation Overview

### Phase 1: Browser Dependency Injection
- **Status**: ✅ Complete
- **Files Modified**:
  - `web/lib/scrapers/browser.ts` - Added optional `browser` parameter
  - `web/lib/scrapers/index.ts` - Updated `fetchJobs` to accept browser
  - `web/lib/scrapers/dayforce.ts` - Updated to pass browser through
  - `web/lib/jobs/processor.ts` - Updated `runScrapeStage` to accept browser

### Phase 2: Heavy Scraper Script & Workflow
- **Status**: ✅ Complete
- **Files Created**:
  - `web/scripts/scrape-heavy.ts` - GitHub Actions scraper script
  - `.github/workflows/scrape-heavy.yml` - GitHub Actions workflow
- **Files Modified**:
  - `web/package.json` - Added `puppeteer` to devDependencies

---

## 🔍 Component Review

### 1. Browser Dependency Injection (`web/lib/scrapers/browser.ts`)

#### ✅ Correct Implementation:
- Optional `browser?: Browser` parameter added to all browser scraping functions
- Conditional browser launch: only launches if `browser` is not provided
- Proper cleanup: closes browser only if we created it (not if injected)
- **FIXED**: Pages are now properly closed to prevent memory leaks
- Type safety: Uses `Browser` type from `puppeteer-core` (compatible with both)

#### Key Functions:
- `scrapeJobsWithBrowser(config, browser?)` - Generic scraper
- `scrapeDayforceWithBrowser(atsIdentifier, browser?)` - Dayforce-specific
- `scrapeGenericJobBoard(url, baseIdentifier, browser?)` - Generic fallback

#### Memory Management:
```typescript
// ✅ Pages are closed in finally block
try {
  const page = await browserInstance.newPage();
  try {
    // ... scraping logic ...
  } finally {
    await page.close(); // Always close page
  }
} finally {
  // Only close browser if we created it
  if (shouldCloseBrowser && browserInstance) {
    await browserInstance.close();
  }
}
```

---

### 2. Scraper Integration (`web/lib/scrapers/index.ts`)

#### ✅ Correct Implementation:
- `fetchJobs()` accepts optional `browser` parameter
- Passes browser through to:
  - `fetchDayforceJobs()` for Dayforce ATS
  - `scrapeGenericJobBoard()` for browser-based ATS types
- Non-browser scrapers (Lever, Greenhouse, etc.) ignore browser parameter (correct)

#### ATS Type Handling:
- **API-based** (Lever, Greenhouse, Workable, Ashby): Browser parameter ignored ✅
- **Dayforce**: Browser passed through ✅
- **Browser-based** (Workday, SmartRecruiters, etc.): Browser passed through ✅

---

### 3. Job Processor (`web/lib/jobs/processor.ts`)

#### ✅ Correct Implementation:
- `runScrapeStage()` accepts optional `browser` parameter
- Passes browser to `fetchJobs()`
- Maintains backward compatibility (browser is optional)

---

### 4. Heavy Scraper Script (`web/scripts/scrape-heavy.ts`)

#### ✅ Correct Implementation:
- Environment variable validation
- Supabase admin client initialization
- Company record fetching with error handling
- Full `puppeteer` browser launch (not `puppeteer-core`)
- Browser instance passed to `fetchJobs()`
- Job run and task creation for tracking
- Calls `runIngestStage()` to save results
- Comprehensive error handling with database updates
- Browser cleanup in `finally` block

#### Browser Launch Configuration:
```typescript
browser = await puppeteer.launch({
  headless: true,
  args: [
    "--no-sandbox",              // Required for GitHub Actions
    "--disable-setuid-sandbox",  // Required for GitHub Actions
    "--disable-dev-shm-usage",   // Prevents shared memory issues
    "--disable-accelerated-2d-canvas",
    "--disable-gpu",
  ],
});
```

#### Error Handling:
- ✅ Validates COMPANY_ID
- ✅ Validates Supabase environment variables
- ✅ Handles company fetch errors
- ✅ Handles browser launch errors
- ✅ Handles scraping errors (updates task/job run status)
- ✅ Ensures browser cleanup even on errors

---

### 5. GitHub Actions Workflow (`.github/workflows/scrape-heavy.yml`)

#### ✅ Correct Implementation:
- Manual trigger with `company_id` input
- Node.js 20 setup with npm cache
- Proper working directory (`web/`)
- Environment variables passed correctly:
  - `COMPANY_ID` from workflow input
  - `NEXT_PUBLIC_SUPABASE_URL` from secrets
  - `SUPABASE_SERVICE_ROLE_KEY` from secrets

#### Workflow Steps:
1. ✅ Checkout code
2. ✅ Setup Node.js 20 with npm cache
3. ✅ Install dependencies (`npm ci`)
4. ✅ Run scraper script with environment variables

---

### 6. Dependencies (`web/package.json`)

#### ✅ Correct Configuration:
- `puppeteer-core`: In `dependencies` (for Vercel/serverless)
- `puppeteer`: In `devDependencies` (for GitHub Actions)
- `@sparticuz/chromium`: In `dependencies` (for Vercel)

#### Note on `tsx`:
- Not in package.json, but that's fine
- `npx tsx` will download it automatically
- Alternatively, could add to devDependencies if preferred

---

## 🔧 Type Compatibility

### Browser Type:
- ✅ Uses `Browser` from `puppeteer-core`
- ✅ Compatible with both `puppeteer-core` and `puppeteer` (same type)
- ✅ TypeScript compilation verified (no errors)

### Import Strategy:
```typescript
// In browser.ts (Vercel-compatible)
import type { Browser } from "puppeteer-core";

// In scrape-heavy.ts (GitHub Actions)
import puppeteer from "puppeteer";  // Full puppeteer
import type { Browser } from "puppeteer-core";  // Type import
```

---

## 🐛 Issues Found & Fixed

### Critical Issue #1: Page Memory Leak
- **Problem**: Pages were not being closed after scraping
- **Impact**: Memory leaks, especially when browser is reused
- **Status**: ✅ FIXED - Pages now closed in `finally` block

### Potential Issue #2: Type Compatibility
- **Concern**: `puppeteer` vs `puppeteer-core` Browser type compatibility
- **Status**: ✅ VERIFIED - Types are compatible (same interface)

### Potential Issue #3: tsx Path Resolution
- **Concern**: TypeScript path aliases (`@/*`) might not resolve in tsx
- **Status**: ⚠️ NEEDS VERIFICATION - Should work with tsconfig.json, but test to confirm
- **Mitigation**: If issues occur, can add `tsconfig-paths/register` or use relative imports

---

## ✅ Verification Checklist

### Pre-Testing:
- [x] Browser dependency injection implemented correctly
- [x] Pages are closed after use (memory leak fixed)
- [x] Browser cleanup happens in all error scenarios
- [x] TypeScript types are correct and compatible
- [x] Environment variables are validated
- [x] Error handling is comprehensive
- [x] Database operations have proper error handling
- [x] GitHub Actions workflow is correctly configured

### Testing Requirements:
- [ ] Test locally with `COMPANY_ID` environment variable
- [ ] Test GitHub Actions workflow with valid company ID
- [ ] Verify browser launches successfully in GitHub Actions
- [ ] Verify jobs are fetched correctly
- [ ] Verify jobs are saved to database
- [ ] Verify error handling works (test with invalid company ID)
- [ ] Verify browser cleanup happens (check logs)
- [ ] Verify no memory leaks (monitor resource usage)

---

## 🧪 Testing Instructions

### Local Testing:
```bash
cd web
export COMPANY_ID=<your-company-uuid>
export NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
export SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
npx tsx scripts/scrape-heavy.ts
```

### GitHub Actions Testing:
1. Go to repository → Actions tab
2. Select "Heavy Scraper" workflow
3. Click "Run workflow"
4. Enter a valid `company_id` (UUID from companies table)
5. Click "Run workflow"
6. Monitor logs for:
   - ✅ Browser launch success
   - ✅ Company fetch success
   - ✅ Jobs fetched count
   - ✅ Ingest results
   - ✅ Browser cleanup

### Expected Output:
```
🚀 Starting heavy scraper script...
📋 Company ID: <uuid>
🔌 Initializing Supabase admin client...
🔍 Fetching company record for ID: <uuid>...
✅ Found company: <name> (<ats_type>)
🌐 Launching Puppeteer browser...
✅ Browser launched successfully
📝 Creating job run task...
✅ Created task: <task-id>
🔎 Fetching jobs for <name>...
✅ Fetched <n> jobs
💾 Ingesting jobs into database...
✅ Ingest complete:
   - New jobs: <n>
   - Updated jobs: <n>
   - Closed jobs: <n>
✅ Scraping completed successfully!
🔒 Closing browser...
✅ Browser closed
```

---

## 📋 Known Limitations & Considerations

### 1. Path Resolution
- **Issue**: `tsx` may not resolve `@/*` path aliases
- **Impact**: Script might fail to import modules
- **Solution**: If occurs, add `tsconfig-paths` or use relative imports

### 2. Browser Type Compatibility
- **Status**: ✅ Verified compatible
- **Note**: Both `puppeteer` and `puppeteer-core` export same `Browser` type

### 3. Memory Usage
- **Consideration**: Full Puppeteer uses more memory than puppeteer-core
- **Mitigation**: Browser is closed after each run, pages are closed
- **Monitoring**: Watch GitHub Actions resource usage

### 4. Timeout Handling
- **Current**: 30s page navigation timeout, 10s selector timeout
- **Consideration**: Some sites may need longer timeouts
- **Future**: Could make timeouts configurable

---

## 🚀 Ready for Testing

### Summary:
✅ **All critical issues fixed**
✅ **Implementation complete**
✅ **Error handling comprehensive**
✅ **Memory management correct**
✅ **Type safety verified**

### Next Steps:
1. Add GitHub secrets (see `docs/GITHUB_SECRETS_SETUP.md`)
2. Test locally with a valid company ID
3. Test GitHub Actions workflow
4. Monitor for any runtime issues
5. Adjust timeouts/configurations as needed

---

## 📝 Additional Notes

### Browser Reuse:
- When browser is injected, it's reused across multiple scrapes
- Pages are always closed, but browser stays open (caller owns it)
- This is correct behavior for GitHub Actions (single company per run)

### Vercel Compatibility:
- Vercel continues to use `puppeteer-core` + `@sparticuz/chromium`
- No changes needed to existing Vercel deployments
- Backward compatible: browser parameter is optional

### Database Tracking:
- Script creates `job_runs` and `job_run_tasks` records
- Tracks progress, errors, and results
- Compatible with existing job processing system

---

**Review Date**: 2025-01-20
**Reviewer**: AI Assistant
**Status**: ✅ Ready for Testing
