# Department Field Data Quality Assessment

**Date:** January 24, 2026  
**Purpose:** Review department field data quality and identify issues with cookie-related text and empty values

---

## Executive Summary

The department field in `job_postings` contains invalid data (cookie/privacy-related text) and empty values. This assessment determines whether the issue is from old scraper versions (fixable by re-scraping) or requires scraper code fixes.

---

## Issue Analysis

### Problem Description

Based on the screenshot and code review, department field values include:
- **Empty/null values** - Many jobs have no department information
- **Cookie/privacy-related text** - Some department values contain cookie banner text (e.g., "Accept Cookies", "Cookie Preferences", etc.)

### Root Cause

The issue originates from **browser-based scrapers** (`web/lib/scrapers/browser.ts`) that use overly broad CSS selectors:

```typescript
// Current problematic selectors
const deptSelectors = [
  '[class*="department"]',
  '[class*="Department"]',
  '[class*="category"]',
  '[class*="Category"]',
];
```

**Problems:**
1. **Too broad**: `[class*="department"]` matches ANY element with "department" in the class name, including:
   - Cookie banners: `cookie-preference-department`, `cookie-settings-department`
   - Privacy modals: `privacy-policy-department`
   - Footer links: `footer-department-links`
   - Navigation menus: `nav-department-menu`

2. **No scoping**: Uses `document.querySelector()` which selects the FIRST match globally, not scoped to the job listing element

3. **No validation**: No filtering to exclude cookie/privacy-related keywords

4. **No fallback logic**: If a bad match is found, it's used without validation

### Affected Scrapers

#### ✅ API-Based Scrapers (NOT affected)
These extract department from structured API responses and are reliable:
- **Greenhouse** (`src/scrapers/greenhouse.py`, `web/lib/scrapers/greenhouse.ts`)
  - Extracts from `departments[0].name` in API response ✅
- **Lever** (`src/scrapers/lever.py`, `web/lib/scrapers/lever.ts`)
  - Extracts from `categories.department` in API response ✅
- **Workable** (`src/scrapers/workable.py`, `web/lib/scrapers/workable.ts`)
  - Extracts from `department` field in API response ✅

#### ⚠️ Browser-Based Scrapers (AFFECTED)
These use DOM scraping and are vulnerable to cookie banner matches:
- **Generic Browser Scraper** (`web/lib/scrapers/browser.ts`)
  - Used for companies without standard ATS APIs
  - Lines 181-183: Generic job listing extraction
  - Lines 390-404: Dayforce scraper department extraction
  - Lines 696-710: SuccessFactors scraper department extraction

#### ✅ Custom Scrapers (NOT affected)
These explicitly set `department=None`:
- **QuestradeScraper** (`src/scrapers/custom.py:124`)
- **TangerineScraper** (`src/scrapers/custom.py:268`)
- **WorkdayScraper** (`src/scrapers/custom.py:354`)

---

## Recommended Fixes

### 1. Improve CSS Selectors (High Priority)

**Current approach:**
```typescript
const deptSelectors = [
  '[class*="department"]',
  '[class*="Department"]',
];
```

**Recommended approach:**
```typescript
// More specific selectors that target job listing context
const deptSelectors = [
  // Job-specific containers first
  '[class*="job"] [class*="department"]',
  '[class*="Job"] [class*="department"]',
  '[class*="posting"] [class*="department"]',
  '[class*="Posting"] [class*="department"]',
  '[class*="position"] [class*="department"]',
  '[class*="Position"] [class*="department"]',
  '[class*="role"] [class*="department"]',
  '[class*="Role"] [class*="department"]',
  // Then broader selectors, but with validation
  '[class*="department"]',
  '[class*="Department"]',
];
```

### 2. Add Validation/Filtering (Critical)

Add a validation function to filter out invalid department values:

```typescript
function isValidDepartment(dept: string | null | undefined): boolean {
  if (!dept || dept.trim().length === 0) return false;
  
  const lower = dept.toLowerCase().trim();
  
  // Reject cookie/privacy-related text
  const badKeywords = [
    'cookie', 'cookies', 'accept', 'decline', 'preferences',
    'privacy', 'policy', 'gdpr', 'consent', 'manage',
    'necessary', 'analytics', 'marketing', 'functional',
    'settings', 'preferences'
  ];
  
  if (badKeywords.some(keyword => lower.includes(keyword))) {
    return false;
  }
  
  // Reject very short or very long values (likely not a department)
  if (lower.length < 2 || lower.length > 100) {
    return false;
  }
  
  // Reject common non-department text
  const nonDepartmentPatterns = [
    /^click/i,
    /^read more/i,
    /^learn more/i,
    /^apply/i,
    /^view/i,
  ];
  
  if (nonDepartmentPatterns.some(pattern => pattern.test(lower))) {
    return false;
  }
  
  return true;
}
```

### 3. Scope Selectors to Job Container (Important)

Instead of searching the entire document, scope searches to the job listing element:

```typescript
// Find job container first
const jobContainer = el.closest('[class*="job"], [class*="posting"], [class*="position"]') || el;

// Then search within that container
const deptEl = jobContainer.querySelector('[class*="department"]');
```

### 4. Add Fallback Logic

If department extraction fails or returns invalid data, try alternative extraction methods:

```typescript
// Try structured selectors first
let department = extractFromStructuredSelectors(jobElement);

// If invalid, try extracting from job title patterns
if (!isValidDepartment(department)) {
  department = extractFromTitlePatterns(title);
}

// If still invalid, try extracting from description
if (!isValidDepartment(department)) {
  department = extractFromDescription(descriptionHtml);
}

// Final validation - return null if still invalid
return isValidDepartment(department) ? department : null;
```

---

## Action Plan

### Phase 1: Fix Scrapers (Immediate)

1. **Update browser.ts** with:
   - Improved CSS selectors (scoped to job containers)
   - Validation function to filter bad values
   - Better fallback logic

2. **Test fixes** on affected companies:
   - Run test scrapes on companies known to have cookie issues
   - Verify department values are correct
   - Ensure no false positives (rejecting valid departments)

### Phase 2: Data Cleanup (After Fixes)

1. **Identify affected records**:
   - Query database for jobs with suspicious department values
   - Group by company and ATS type
   - Create list of jobs to re-scrape

2. **Re-scrape affected companies**:
   - Run collection jobs for companies with bad data
   - New scrapes will use fixed scrapers
   - Old bad data will be replaced with correct data

3. **Optional: Manual cleanup**:
   - For jobs that are no longer active, manually set `department = NULL`
   - Or create a cleanup script to null out suspicious values

### Phase 3: Prevention (Ongoing)

1. **Add validation at ingestion**:
   - Validate department values before saving to database
   - Log warnings for suspicious values
   - Allow manual review of flagged values

2. **Monitoring**:
   - Add alerts for unusual department values
   - Track department value quality metrics
   - Regular audits of data quality

---

## Conclusion

### Is this from old scrapers?

**Partially yes, but scrapers still need fixes:**

1. **Old data**: Some bad data is likely from previous scraper runs before fixes
2. **Current scrapers**: The browser-based scrapers still have the vulnerability and will continue to produce bad data until fixed
3. **Re-scraping alone won't fix it**: Without scraper fixes, re-scraping will just create new bad data

### Recommendation

**Fix scrapers FIRST, then re-scrape:**
1. ✅ Fix browser-based scrapers (add validation, improve selectors)
2. ✅ Test fixes on sample companies
3. ✅ Re-scrape affected companies to replace bad data
4. ✅ Add ongoing validation to prevent future issues

---

## Files to Update

1. `web/lib/scrapers/browser.ts`
   - Add `isValidDepartment()` validation function
   - Update department extraction selectors (lines 181-183, 390-404, 696-710)
   - Add scoping to job container elements
   - Add fallback extraction logic

2. `web/lib/scrapers/dayforce.ts` (if exists)
   - Review department extraction logic
   - Add validation

3. `web/lib/scrapers/successfactors.ts` (if exists)
   - Review department extraction logic
   - Add validation

---

## Testing Checklist

- [ ] Test scraper on company with cookie banner
- [ ] Verify department is NOT extracted from cookie banner
- [ ] Verify valid departments ARE still extracted correctly
- [ ] Test on company with no department field (should return null)
- [ ] Test on company with department in different locations
- [ ] Verify re-scraped jobs have correct department values
- [ ] Check that old bad data is replaced after re-scraping
