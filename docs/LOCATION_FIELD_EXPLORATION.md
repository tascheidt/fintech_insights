# Location Field Exploration

**Date:** January 24, 2026  
**Purpose:** Explore how to fix location field issues (placeholder text like "Search by Location") and implement location extraction from job descriptions

---

## Current State Analysis

### Problem Identified

**Issue:** Tangerine jobs (and potentially others) have location field set to "Search by Location" instead of actual location data.

**Root Cause:**
- TangerineScraper (`src/scrapers/custom.py:248`) extracts location from Workday API: `location = job.get("locationsText", "")`
- Workday API returns "Search by Location" as a placeholder when location isn't specified in their system
- No validation/filtering of placeholder text before storing
- Location is stored as-is without checking if it's valid

**Evidence from Screenshot:**
- Job description shows: "Location(s): Canada : Ontario : Toronto"
- Database shows: "Search by Location"
- This indicates location IS available in description but scraper isn't extracting it

### Current Location Extraction Flow

1. **Scrapers extract location:**
   - **API scrapers** (Greenhouse, Lever, Workable): Extract from structured API fields
   - **Browser scrapers**: Use CSS selectors like `[class*="location"]`
   - **TangerineScraper**: Uses `job.get("locationsText", "")` from Workday API

2. **Location is stored directly:**
   - No validation of placeholder text
   - No fallback extraction from description
   - Stored as-is in `job_postings.location`

3. **Silver Layer processing:**
   - Currently extracts: summary, seniority, salary, tech_stack, keywords, standardized_department
   - **Does NOT extract location** from description

---

## Proposed Solution

### Approach: Multi-Layer Location Extraction

1. **Validation Layer:** Detect and reject placeholder/invalid location values
2. **Extraction Layer:** Use Gemini to extract location from description if scraper location is invalid
3. **Normalization Layer:** Standardize location format (optional)

### Implementation Plan

#### Phase 1: Add Location Validation

Create `isValidLocation()` function similar to `isValidDepartment()`:

```typescript
export function isValidLocation(location: string | null | undefined): boolean {
  if (!location || location.trim().length === 0) {
    return false;
  }
  
  const lower = location.toLowerCase().trim();
  
  // Reject placeholder/search text
  const placeholderPatterns = [
    'search by location',
    'select location',
    'choose location',
    'location search',
    'filter by location',
    'all locations',
    'any location',
    'multiple locations',
    'various locations',
  ];
  
  if (placeholderPatterns.some(pattern => lower.includes(pattern))) {
    return false;
  }
  
  // Reject very short values (likely not a location)
  if (lower.length < 2) {
    return false;
  }
  
  // Reject common non-location text
  const nonLocationPatterns = [
    /^click/i,
    /^select/i,
    /^choose/i,
    /^filter/i,
  ];
  
  if (nonLocationPatterns.some(pattern => pattern.test(lower))) {
    return false;
  }
  
  return true;
}
```

#### Phase 2: Add Location to Silver Layer Extraction & Refactor to Structured JSON

**Update `JobStructureSchema` to include structured location and refactor all fields to structured format:**

```typescript
export const JobStructureSchema = z.object({
  summary: z.string().describe("2-3 sentence summary of the job role"),
  seniority_level: z.enum([...]).describe("Seniority level"),
  salary: z.object({
    min: z.number().int().positive().nullable(),
    max: z.number().int().positive().nullable(),
    currency: z.string().default("USD"),
  }).nullable().describe("Salary range if found"),
  tech_stack: z.array(z.string()).describe("Array of technologies"),
  keywords: z.array(z.string()).describe("Array of keywords"),
  standardized_department: z.string().describe("Standardized department name"),
  location: z.object({
    city: z.string().nullable(),
    state: z.string().nullable(),  // State, province, region
    country: z.string().nullable(),
    formatted: z.string().nullable(),  // "Toronto, Ontario, Canada"
  }).nullable().describe("Structured location extracted from description. Look for 'Location(s):' section. Return null if not found."),
});
```

**Benefits of structured JSON:**
- Better type safety
- Easier to query and filter by country/state/city
- Consistent data structure
- Can extend with more fields (e.g., coordinates, timezone)
- Backward compatible (can generate formatted string from structured data)

**Update extraction prompt** to:
- Always extract location from description (even if scraper provided one)
- Extract as structured object (city, state, country)
- Generate formatted string for display

#### Phase 3: Update Processing Pipeline

Modify `extractAndUpdateStructure()` to:
1. Always extract location from description via Gemini (source of truth)
2. Validate scraper-provided location (for logging/debugging)
3. Update `location` field with formatted string from structured data
4. Store `location_structured` as JSONB in database
5. If extraction returns null, set location to null (not placeholder text)

#### Phase 4: Clean Existing Data

Create backfill script to:
1. Find jobs with invalid location values
2. Re-process to extract location from descriptions
3. Update location field

---

## Decisions Made

### 1. Location Extraction Strategy ✅

**Decision:** **B - Always extract location from description if available**

- Use description as source of truth for location
- Extract location even if scraper provided a valid location
- This ensures consistency and accuracy

### 2. Location Format ✅

**Decision:** **C - Extract as structured JSON**

- Extract location as structured object: `{ city: string, state: string | null, country: string }`
- Store in database as JSONB field (new column: `location_structured`)
- Keep existing `location` field as text (for backward compatibility)
- Can display formatted location: "Toronto, Ontario, Canada" or "Toronto, Canada"

### 3. Location Extraction Priority ✅

**Decision:** **A - Add to existing Gemini call**

- Add location extraction to existing `extractJobStructure()` call
- More efficient (single API call)
- Location context helps with other extractions

### 4. Structured JSON for All Fields ✅

**Decision:** **Update Gemini extraction to return structured JSON for all fields**

- Current: Returns flat structure with some nested objects (salary)
- Proposed: Return fully structured JSON with nested objects where appropriate
- Benefits:
  - Better type safety
  - Easier to extend
  - More consistent data structure
  - Can add more structured fields in future (e.g., structured tech_stack categories)

### 5. Scraper Improvement ✅

**Decision:** **C - Do both**

- **Improve TangerineScraper:** Fetch full job details and extract location from description
- **Add post-processing:** Use Silver Layer extraction as fallback/enrichment
- Best of both worlds: Better initial data + enrichment layer

### 6. Placeholder Detection Patterns

**Patterns to detect:**
- "Search by Location"
- "Select Location"
- "Choose Location"
- "Filter by Location"
- "All Locations"
- "Any Location"
- "Multiple Locations"
- "Location TBD"
- "To be determined"
- "Various locations"
- "Multiple locations available"

### 7. Location Extraction Details

**Structured format:**
```typescript
location: {
  city: string | null;
  state: string | null;  // State, province, region
  country: string | null;
  formatted: string | null;  // "Toronto, Ontario, Canada"
}
```

**Extraction guidance for Gemini:**
- Look for "Location(s):" section in description
- Extract city, state/province, country separately
- Handle multiple locations (return first primary location, or array)
- Format as "City, State, Country" when possible
- Return null for any field not found

---

## Current Code Locations

### Key Files

1. **`src/scrapers/custom.py`**
   - `TangerineScraper._parse_workday_job()` - Extracts location from `locationsText`

2. **`web/lib/analysis/structure.ts`**
   - `extractJobStructure()` - Silver Layer extraction (doesn't currently extract location)
   - `isValidDepartment()` - Validation function (can use as template)

3. **`web/lib/jobs/processor.ts`**
   - `extractAndUpdateStructure()` - Processes each job (doesn't validate/clean location)
   - `runIngestStage()` - Main ingestion pipeline

4. **`web/lib/scrapers/browser.ts`**
   - Browser-based scrapers that extract location via CSS selectors

---

## Implementation Dependencies

### Required Changes

1. **Add location validation function** (`web/lib/analysis/structure.ts`)
   - `isValidLocation()` - Detect placeholder text like "Search by Location"

2. **Refactor extraction schema to structured JSON** (`web/lib/analysis/structure.ts`)
   - Update `JobStructureSchema` to return structured location object
   - Update all field types to be more structured where appropriate
   - Update extraction prompt to extract structured location

3. **Add database migration** for structured location
   - Add `location_structured` JSONB column to `job_postings` table
   - Keep existing `location` TEXT column for backward compatibility

4. **Update `extractAndUpdateStructure()`** (`web/lib/jobs/processor.ts`)
   - Always extract location from description
   - Store structured location as JSONB
   - Generate formatted string for `location` field
   - Validate and clean invalid scraper locations

5. **Update processing pipeline** (`web/lib/jobs/processor.ts`)
   - Clean invalid locations during ingestion
   - Set to null if extraction fails (not placeholder text)

6. **Create backfill script** for existing bad data
   - Find jobs with invalid location values
   - Re-process to extract structured location from descriptions
   - Update both `location` and `location_structured` fields

7. **Improve TangerineScraper** (`src/scrapers/custom.py`)
   - Fetch full job details page
   - Extract location from description HTML/text
   - Parse "Location(s):" section
   - This improves initial scraping quality

### Database Schema Changes

**New column:**
```sql
ALTER TABLE job_postings 
  ADD COLUMN IF NOT EXISTS location_structured JSONB;

-- Example structure:
-- {
--   "city": "Toronto",
--   "state": "Ontario", 
--   "country": "Canada",
--   "formatted": "Toronto, Ontario, Canada"
-- }
```

**Index for querying:**
```sql
CREATE INDEX IF NOT EXISTS idx_job_postings_location_country 
  ON job_postings((location_structured->>'country'));

CREATE INDEX IF NOT EXISTS idx_job_postings_location_state 
  ON job_postings((location_structured->>'state'));
```

---

## Implementation Plan

### Phase 1: Database Migration
1. Create migration to add `location_structured` JSONB column
2. Add indexes for querying by country/state

### Phase 2: Update Extraction Schema
1. Refactor `JobStructureSchema` to structured JSON format
2. Add structured location object to schema
3. Update extraction prompt to extract structured location
4. Update prompt to always extract location (not conditional)

### Phase 3: Add Validation
1. Create `isValidLocation()` function
2. Add placeholder pattern detection
3. Use in processing pipeline to clean invalid values

### Phase 4: Update Processing Pipeline
1. Update `extractAndUpdateStructure()` to:
   - Always extract location from description
   - Store structured location as JSONB
   - Generate formatted string for `location` field
   - Clean invalid scraper locations
2. Update `runIngestStage()` to pass location context

### Phase 5: Improve TangerineScraper
1. Add method to fetch full job details page
2. Extract location from description HTML
3. Parse "Location(s):" section
4. Update `_parse_workday_job()` to use extracted location

### Phase 6: Backfill Existing Data
1. Create backfill script to find jobs with invalid locations
2. Re-process to extract structured location
3. Update database with extracted data

## Next Steps

1. ✅ **Decisions made** - All questions answered
2. **Create database migration** for `location_structured` column
3. **Refactor extraction schema** to structured JSON
4. **Implement validation and extraction**
5. **Improve TangerineScraper** to extract location from description
6. **Test on sample jobs** (especially Tangerine)
7. **Backfill existing data** with invalid locations
