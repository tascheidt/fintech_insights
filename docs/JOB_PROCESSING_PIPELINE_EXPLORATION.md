# Job Processing Pipeline Exploration

**Date:** January 24, 2026  
**Purpose:** Understand how scraped jobs are processed and enriched, and identify opportunities for consistent field enrichment

---

## Current Architecture Overview

### Pipeline Flow

```
1. SCRAPE Stage
   ↓
   Raw job data scraped (department may contain bad data like cookies)
   ↓
2. INGEST Stage  
   ↓
   Jobs inserted/updated in database with raw scraped data
   ↓
   For EACH job (new or updated):
   → extractAndUpdateStructure() called
   → extractJobStructure() uses AI to extract structured data
   → Updates Silver Layer fields (summary, seniority, salary, tech_stack, standardized_department)
   ↓
3. ANALYZE Stage (optional, only for strategic companies)
   ↓
   Strategic insights generated
```

---

## Key Findings

### ✅ Every Job IS Processed

**Location:** `web/lib/jobs/processor.ts:191-220`

- `extractAndUpdateStructure()` is called for **every job** during ingestion (both new and updated)
- Runs asynchronously in parallel (doesn't block ingestion)
- Only requires `description_text` to be present

```typescript
// For updated jobs
if (row.description_text) {
  extractionPromises.push(
    extractAndUpdateStructure(existingId, job.title, row.description_text)
  );
}

// For new jobs  
if (row.description_text) {
  extractionPromises.push(
    extractAndUpdateStructure(inserted.id, job.title, row.description_text)
  );
}
```

### ⚠️ Raw Department Field is NOT Cleaned

**Current Behavior:**
- Raw `department` from scrapers is stored as-is in `job_postings.department`
- Bad data (cookie banners, etc.) remains in the database
- `extractAndUpdateStructure()` does NOT update the raw `department` field
- Only `standardized_department` is populated (from AI extraction)

**Code Evidence:**
```typescript
// processor.ts:79-93
async function extractAndUpdateStructure(
  jobId: string,
  jobTitle: string,
  description: string  // ← Only receives title and description
): Promise<void> {
  const structure = await extractJobStructure(jobTitle, description);
  // ...
  await supabase.from('job_postings').update({
    standardized_department: structure.standardized_department,
    // ← department field is NOT updated here
  });
}
```

### ✅ Standardized Department IS Populated

**Location:** `web/lib/analysis/structure.ts:82-206`

- AI extracts `standardized_department` from job title + description
- Uses Gemini Flash with structured JSON output
- Normalizes to common values: "Engineering", "Sales", "Marketing", etc.
- **BUT**: Does not use raw `department` field as input/hint

### ❌ Keywords Column is NOT Populated

**Location:** `web/lib/jobs/processor.ts:113` and `web/lib/analysis/structure.ts`

**Problem:**
1. Keywords is hardcoded to empty array: `keywords: []`
2. Not included in extraction schema (`JobStructureSchema`)
3. Not mentioned in extraction prompt
4. Comment says: `// Keywords extraction can be added later if needed`

**Evidence:**
```typescript
// processor.ts:113
keywords: [], // Keywords extraction can be added later if needed

// structure.ts:12-31
export const JobStructureSchema = z.object({
  summary: z.string(),
  seniority_level: z.enum([...]),
  salary: z.object({...}).nullable(),
  tech_stack: z.array(z.string()),
  standardized_department: z.string(),
  // ← keywords NOT in schema
});
```

---

## Opportunities for Consistent Enrichment

### Opportunity 1: Use Raw Department as Input to AI Extraction

**Current:** AI only sees title + description  
**Proposed:** Pass raw `department` field as additional context

**Benefits:**
- AI can use raw department as a hint/validation
- Can detect and correct bad values (cookie text)
- Better accuracy for `standardized_department` extraction

**Implementation:**
```typescript
// Modify extractAndUpdateStructure to fetch and pass raw department
async function extractAndUpdateStructure(
  jobId: string,
  jobTitle: string,
  description: string,
  rawDepartment?: string | null  // ← Add this parameter
): Promise<void> {
  const structure = await extractJobStructure(
    jobTitle, 
    description,
    rawDepartment  // ← Pass to extraction
  );
}
```

### Opportunity 2: Clean Raw Department Field

**Current:** Bad department values remain in database  
**Proposed:** Use AI extraction to validate and fix raw department

**Options:**
- **Option A:** Update raw `department` field with cleaned value from AI
- **Option B:** Keep raw `department` as-is, but use `standardized_department` everywhere in UI
- **Option C:** Set raw `department = NULL` if AI detects it's invalid

**Recommendation:** Option B (keep raw, use standardized) - preserves original data for debugging

### Opportunity 3: Extract Keywords

**Current:** Keywords column exists but is always empty  
**Proposed:** Add keywords extraction to AI pipeline

**Implementation:**
1. Add `keywords` to `JobStructureSchema`
2. Update extraction prompt to include keywords
3. Extract keywords from description (skills, technologies, domains, etc.)
4. Store as TEXT[] array in database

**Example:**
```typescript
keywords: z.array(z.string()).describe("Array of relevant keywords, skills, domains, or topics")
```

---

## Questions & Clarifications Needed

### 1. Department Field Strategy

**Question:** What should we do with the raw `department` field?

- **A)** Keep as-is (preserve original scraped data, even if bad)
- **B)** Clean it using AI extraction (overwrite bad values)
- **C)** Set to NULL if AI detects invalid values
- **D)** Use `standardized_department` everywhere and ignore raw `department`

**Recommendation:** Option A + D - Keep raw for debugging, use standardized in UI

### 2. Keywords Extraction Scope

**Question:** What should keywords include?

- **A)** Only technical skills/technologies (overlap with tech_stack?)
- **B)** Domain keywords (e.g., "fintech", "payments", "compliance")
- **C)** Role keywords (e.g., "leadership", "strategy", "analytics")
- **D)** All of the above (comprehensive keyword extraction)

**Recommendation:** Option D - Comprehensive extraction, can filter/use as needed

### 3. Raw Department as Input

**Question:** Should we pass raw `department` to AI extraction?

- **A)** Yes - Use as hint/context for better extraction
- **B)** No - Let AI extract independently from description
- **C)** Conditional - Only if raw department passes validation

**Recommendation:** Option A - Use as context, but don't blindly trust it

### 4. Processing Scope

**Question:** Should we re-process existing jobs with bad department data?

- **A)** Yes - Run backfill script to fix existing bad data
- **B)** No - Only fix going forward
- **C)** Conditional - Only re-process jobs with suspicious department values

**Recommendation:** Option C - Targeted cleanup of known bad data

### 5. Keywords vs Tech Stack

**Question:** How should keywords differ from tech_stack?

- **A)** Keywords = broader (domains, skills, concepts), tech_stack = specific technologies
- **B)** Keywords = subset of tech_stack (most important ones)
- **C)** Keywords = non-technical terms, tech_stack = technical only

**Recommendation:** Option A - Keywords broader, tech_stack specific

---

## Proposed Implementation Plan

### Phase 1: Enhance Extraction Function

1. **Modify `extractJobStructure()` signature:**
   ```typescript
   export async function extractJobStructure(
     jobTitle: string,
     description: string,
     rawDepartment?: string | null,  // ← Add optional parameter
     retryCount?: number
   )
   ```

2. **Update extraction prompt** to include raw department context:
   ```
   Raw Department (from ATS): {raw_department}
   Note: This may be empty or contain invalid data. Use it as a hint but extract the correct standardized department from the description.
   ```

3. **Add keywords to schema:**
   ```typescript
   keywords: z.array(z.string()).describe("Array of relevant keywords, skills, domains, or topics extracted from the job description")
   ```

### Phase 2: Update Processing Pipeline

1. **Modify `extractAndUpdateStructure()`** to:
   - Fetch raw `department` from database
   - Pass it to `extractJobStructure()`
   - Update `keywords` field (not just empty array)

2. **Update `runIngestStage()`** to pass raw department:
   ```typescript
   extractAndUpdateStructure(
     existingId, 
     job.title, 
     row.description_text,
     row.department  // ← Pass raw department
   )
   ```

### Phase 3: Add Validation/Filtering

1. **Add validation function** to detect bad department values
2. **Optionally clean** raw department field if invalid
3. **Log warnings** for suspicious values

### Phase 4: Backfill Existing Data

1. **Create script** to re-process jobs with bad department values
2. **Update keywords** for all existing jobs
3. **Validate** standardized_department extraction quality

---

## Current Code Locations

### Key Files

1. **`web/lib/jobs/processor.ts`**
   - `extractAndUpdateStructure()` - Calls extraction for each job
   - `runIngestStage()` - Main ingestion pipeline

2. **`web/lib/analysis/structure.ts`**
   - `extractJobStructure()` - AI extraction function
   - `JobStructureSchema` - Zod schema for extraction
   - Extraction prompt

3. **`web/lib/scrapers/browser.ts`**
   - Browser-based scrapers that extract department (may have cookie issues)

4. **`web/scripts/backfill-silver-layer.ts`**
   - Script to backfill Silver Layer data for existing jobs

---

## Next Steps

1. **Clarify requirements** based on questions above
2. **Design extraction prompt** updates for keywords and department context
3. **Implement changes** to extraction pipeline
4. **Test** on sample jobs
5. **Backfill** existing data if needed
