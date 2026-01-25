# Location Field Enrichment Implementation Plan

**Overall Progress:** `100%` (7/7 steps) ✅

## TLDR
Fix location field issues where placeholder text like "Search by Location" is stored instead of actual locations. Implement structured location extraction from job descriptions using Gemini AI, always using description as source of truth. Add structured JSON storage for better querying and filtering.

## Critical Decisions
- **Always extract location from description** - Use description as source of truth, even if scraper provided location
- **Structured JSON format** - Extract as `{ city, state, country, formatted }` for better querying and filtering
- **Add to existing Gemini call** - Include location extraction in existing `extractJobStructure()` for efficiency
- **Refactor to structured JSON** - Update Gemini extraction to return structured JSON for all fields
- **Do both** - Improve TangerineScraper to extract location from description AND add post-processing enrichment

## Tasks:

- [ ] 🟩 **Step 1: Database Migration for Structured Location**
  - [ ] 🟩 Create migration file to add `location_structured` JSONB column
  - [ ] 🟩 Add indexes for querying by country and state
  - [ ] 🟩 Keep existing `location` TEXT column for backward compatibility

- [ ] 🟩 **Step 2: Add Location Validation Function**
  - [ ] 🟩 Create `isValidLocation()` function in `web/lib/analysis/structure.ts`
  - [ ] 🟩 Detect placeholder patterns: "Search by Location", "Select Location", etc.
  - [ ] 🟩 Reject invalid/placeholder text

- [ ] 🟩 **Step 3: Refactor Extraction Schema to Structured JSON**
  - [ ] 🟩 Update `JobStructureSchema` to include structured location object
  - [ ] 🟩 Location structure: `{ city: string | null, state: string | null, country: string | null, formatted: string | null }`
  - [ ] 🟩 Update extraction prompt to always extract location from description
  - [ ] 🟩 Update prompt to extract structured location format
  - [ ] 🟩 Update `JobStructureForDB` interface to include structured location

- [ ] 🟩 **Step 4: Update Processing Pipeline**
  - [ ] 🟩 Update `extractAndUpdateStructure()` to always extract location from description
  - [ ] 🟩 Store `location_structured` as JSONB in database
  - [ ] 🟩 Generate formatted string for `location` field from structured data
  - [ ] 🟩 Validate and clean invalid scraper locations (set to null)
  - [ ] 🟩 Update `runIngestStage()` to handle location validation

- [ ] 🟩 **Step 5: Improve TangerineScraper**
  - [ ] 🟩 Add method to fetch full job details page from Workday
  - [ ] 🟩 Extract location from description HTML/text
  - [ ] 🟩 Parse "Location(s):" section (e.g., "Canada : Ontario : Toronto")
  - [ ] 🟩 Update `_parse_workday_job()` to use extracted location if available
  - [ ] 🟩 Fallback to `locationsText` from API if description extraction fails

- [ ] 🟩 **Step 6: Update Backfill Scripts**
  - [ ] 🟩 Update `backfill-department-cleanup.ts` to also extract location
  - [ ] 🟩 Create `backfill-location-cleanup.ts` script for location-specific cleanup
  - [ ] 🟩 Find jobs with invalid location values ("Search by Location", etc.)
  - [ ] 🟩 Re-process to extract structured location from descriptions
  - [ ] 🟩 Update both `location` and `location_structured` fields

- [ ] 🟩 **Step 7: Testing & Validation**
  - [ ] 🟩 Test location extraction on Tangerine jobs
  - [ ] 🟩 Verify structured location is stored correctly
  - [ ] 🟩 Verify formatted location string is generated correctly
  - [ ] 🟩 Test validation function with various placeholder patterns
  - [ ] 🟩 Verify invalid locations are set to null (not placeholder text)
  - [ ] 🟩 Test backfill script on sample data
