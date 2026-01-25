# Function Category Implementation Plan

**Date:** January 27, 2026  
**Purpose:** Add `function_category` as a stored field in `job_postings` table with consistent categorization

---

## Current State

### Two Categorization Methods Available

1. **`quickCategorize()`** - Keyword-based, deterministic
   - **Location:** `web/lib/analysis/function-categories.ts`
   - **Input:** Job title only
   - **Method:** Keyword matching (e.g., "backend" → "engineering-backend")
   - **Pros:** Fast, no API costs, deterministic
   - **Cons:** May miss edge cases, inconsistent for ambiguous titles

2. **`categorizePosting()`** - AI-based, more accurate
   - **Location:** `web/lib/analysis/categorizer.ts`
   - **Input:** Job title + company name + full description
   - **Method:** Gemini 3 Flash AI analysis
   - **Pros:** More accurate, handles edge cases, consistent
   - **Cons:** API costs, slower, requires description

### Current Usage

- **Function breakdown in insights:** Uses `quickCategorize()` (title-based)
- **Job template library:** Uses `categorizePosting()` (AI-based)

---

## Question 2: Database Constraint Options

### Option A: CHECK Constraint with All ROLE_CATEGORIES

```sql
ALTER TABLE job_postings 
ADD COLUMN function_category TEXT CHECK (
  function_category IN (
    'engineering-backend', 'engineering-frontend', 'engineering-fullstack',
    'engineering-mobile', 'engineering-data', 'engineering-ml',
    'engineering-devops', 'engineering-security', 'engineering-qa',
    'product-management', 'product-design', 'product-research',
    'marketing-growth', 'marketing-product', 'marketing-content', 'marketing-brand',
    'sales', 'customer-success', 'customer-support',
    'operations', 'finance', 'legal-compliance', 'hr-people',
    'data-analytics', 'risk', 'leadership', 'other'
  )
);
```

**Pros:**
- ✅ **Data integrity:** Prevents invalid values from being stored
- ✅ **Type safety:** Database enforces valid categories
- ✅ **Query performance:** Can use constraint for optimization
- ✅ **Clear documentation:** Constraint shows valid values

**Cons:**
- ⚠️ **Migration complexity:** Need to update constraint if categories change
- ⚠️ **Long constraint:** Many values make constraint verbose

### Option B: TEXT with No Constraint

```sql
ALTER TABLE job_postings 
ADD COLUMN function_category TEXT;
```

**Pros:**
- ✅ **Flexibility:** Easy to add new categories without migration
- ✅ **Simple:** No constraint to maintain
- ✅ **No migration needed:** If categories change

**Cons:**
- ❌ **No data integrity:** Invalid values can be stored
- ❌ **Type safety:** Application must validate
- ❌ **Potential bugs:** Typos or invalid values won't be caught

### Recommendation: **Option A (CHECK Constraint)**

**Rationale:**
- Data integrity is critical for consistent reporting
- Categories are stable (27 categories, unlikely to change frequently)
- Better to catch errors at database level than application level
- Can still add new categories via migration (not a frequent operation)

---

## Question 4: Consistency Strategy

### The Problem

**Current `quickCategorize()` limitations:**
- Only uses job title (no description context)
- Keyword matching can be ambiguous:
  - "Platform Engineer" → might not match keywords → "other"
  - "Infrastructure Engineer" → matches "infrastructure" → "engineering-devops" ✅
  - "Software Engineer" → matches "engineer" → "engineering-fullstack" ✅
  - "Engineer" → matches "engineer" → "engineering-fullstack" ✅
- Edge cases:
  - "Product Engineer" → matches "product" → "product-management" ❌ (wrong!)
  - "Marketing Engineer" → matches "marketing" → "marketing-growth" ❌ (wrong!)
  - "Data Engineer" → matches "data engineer" → "engineering-data" ✅

### Option 1: Use `quickCategorize()` (Title-Based Keyword Matching)

**Current Logic:**
```typescript
export function quickCategorize(jobTitle: string): RoleCategory {
  const titleLower = jobTitle.toLowerCase();
  
  // Engineering categories
  if (["backend", "server", "api"].some((w) => titleLower.includes(w))) {
    return "engineering-backend";
  }
  // ... more keyword checks
  
  return "other";
}
```

**Prompt/Logic:** No prompt - pure keyword matching on job title

**Pros:**
- ✅ Fast (no API calls)
- ✅ Deterministic (same title = same category)
- ✅ No cost
- ✅ Works immediately (doesn't need description)

**Cons:**
- ❌ **Inconsistent for ambiguous titles**
- ❌ **Misses context** (e.g., "Product Engineer" in Engineering dept)
- ❌ **Many jobs end up as "other"**
- ❌ **Can't distinguish similar titles** (e.g., "Engineer" vs "Senior Engineer")

**Example Issues:**
```
"Product Engineer" → "product-management" (wrong if it's an engineering role)
"Marketing Engineer" → "marketing-growth" (wrong if it's an engineering role)
"Platform Engineer" → "other" (should be "engineering-devops")
"Infrastructure Engineer" → "engineering-devops" ✅
```

### Option 2: Use `categorizePosting()` (AI-Based)

**Current Prompt:**
```
Analyze this job posting and categorize it for a job template library.

Job Title: {job_title}
Company: {company_name}
Description:
{description}

Provide analysis in JSON format:
{
    "role_category": "<category from: {categories}>",
    ...
}

Respond ONLY with valid JSON.
```

**Pros:**
- ✅ **More accurate** (uses full description context)
- ✅ **Consistent** (AI understands context)
- ✅ **Handles edge cases** (e.g., "Product Engineer" correctly categorized)
- ✅ **Better for ambiguous titles**

**Cons:**
- ❌ **API costs** (~$0.0001 per job with Gemini 3 Flash)
- ❌ **Slower** (API call per job)
- ❌ **Requires description** (won't work for jobs without descriptions)

**Example Results:**
```
"Product Engineer" + description → AI analyzes → "engineering-fullstack" ✅
"Marketing Engineer" + description → AI analyzes → "engineering-fullstack" ✅
"Platform Engineer" + description → AI analyzes → "engineering-devops" ✅
```

### Option 3: Hybrid Approach

**Strategy:**
- **New jobs:** Use AI (`categorizePosting()`) during `extractAndUpdateStructure()`
- **Backfill:** Use keyword (`quickCategorize()`) for speed/cost
- **Fallback:** If AI fails, use keyword

**Pros:**
- ✅ **Best of both worlds:** Accurate for new jobs, fast for backfill
- ✅ **Cost-effective:** Only pay for new jobs
- ✅ **Consistent going forward:** New jobs get AI categorization

**Cons:**
- ⚠️ **Inconsistent data:** Old jobs use keyword, new jobs use AI
- ⚠️ **May need re-processing:** If we want consistency, need to re-process old jobs

### Option 4: Enhanced Keyword Matching with Department Context

**Strategy:**
- Use `quickCategorize()` but enhance with `standardized_department` as context
- If department is "Engineering" and title is ambiguous, prefer engineering categories
- If department is "Product" and title is ambiguous, prefer product categories

**Example Logic:**
```typescript
function categorizeWithContext(
  title: string, 
  standardizedDepartment?: string | null
): RoleCategory {
  const category = quickCategorize(title);
  
  // If categorized as "other" but have department, use department as hint
  if (category === "other" && standardizedDepartment) {
    return departmentToFunction(standardizedDepartment);
  }
  
  // If mismatch (e.g., "Product Engineer" → "product-management" but dept is "Engineering")
  if (standardizedDepartment === "Engineering" && category.startsWith("product-")) {
    // Re-evaluate with engineering context
    return "engineering-fullstack"; // or use AI
  }
  
  return category;
}
```

**Pros:**
- ✅ **Fast** (no API calls)
- ✅ **Better than pure keyword** (uses department context)
- ✅ **Deterministic**

**Cons:**
- ⚠️ **Still not perfect** (keyword matching limitations remain)
- ⚠️ **Complex logic** (need to handle many edge cases)

---

## Recommendation: **Option 2 (AI-Based) for Consistency**

### Rationale

1. **Consistency is critical:** You mentioned "Most of the time a function group will be the same as a department" - this suggests you want accurate categorization, not just fast categorization

2. **Already extracting other fields:** We're already calling `extractJobStructure()` for every job (extracts `standardized_department`, `seniority_level`, etc.) - we can add function_category to that same AI call

3. **Cost is minimal:** Gemini 3 Flash is very cheap (~$0.0001 per job). For 10,000 jobs = $1.00

4. **Better user experience:** Users see accurate, consistent function labels

### Implementation Strategy

**Add function_category to existing `extractJobStructure()` call:**

Instead of:
```typescript
// Current: extractJobStructure() extracts standardized_department, seniority, etc.
const structure = await extractJobStructure(jobTitle, description, rawDepartment);
```

Do:
```typescript
// Enhanced: Also extract function_category in same AI call
const structure = await extractJobStructure(jobTitle, description, rawDepartment);
// structure now includes function_category
```

**Benefits:**
- ✅ **Single AI call** (already happening, no extra cost)
- ✅ **Consistent with other fields** (all extracted together)
- ✅ **Uses full description context** (more accurate)
- ✅ **Same prompt pattern** (consistent with standardized_department)

### Alternative: If Cost is Concern

**Use hybrid for backfill only:**
- **New jobs:** AI-based (in `extractAndUpdateStructure()`)
- **Backfill script:** Keyword-based (faster, cheaper)
- **Note:** This creates inconsistency, but acceptable for historical data

---

## Implementation Plan

### Step 1: Database Migration

**File:** `web/supabase/migrations/20260127000000_function_category.sql`

```sql
-- Add function_category column with CHECK constraint
ALTER TABLE job_postings 
ADD COLUMN IF NOT EXISTS function_category TEXT CHECK (
  function_category IN (
    'engineering-backend', 'engineering-frontend', 'engineering-fullstack',
    'engineering-mobile', 'engineering-data', 'engineering-ml',
    'engineering-devops', 'engineering-security', 'engineering-qa',
    'product-management', 'product-design', 'product-research',
    'marketing-growth', 'marketing-product', 'marketing-content', 'marketing-brand',
    'sales', 'customer-success', 'customer-support',
    'operations', 'finance', 'legal-compliance', 'hr-people',
    'data-analytics', 'risk', 'leadership', 'other'
  )
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_job_postings_function_category 
ON job_postings(function_category);

-- Add comment
COMMENT ON COLUMN job_postings.function_category IS 
'Function category (role specialization) extracted from job title and description. Maps to ROLE_CATEGORIES enum.';
```

### Step 2: Update `extractJobStructure()` to Include Function Category

**File:** `web/lib/analysis/structure.ts`

- Add `function_category` to `JobStructureSchema`
- Update prompt to extract function_category
- Use `categorizePosting()` logic (AI-based) for consistency

### Step 3: Update Processing Pipeline

**File:** `web/lib/jobs/processor.ts`

- Update `extractAndUpdateStructure()` to store `function_category`

### Step 4: Backfill Script

**File:** `web/scripts/backfill-function-category.ts`

- **Test mode:** Process 10-50 jobs first
- **Then:** Process all jobs
- **Strategy:** Use keyword-based (`quickCategorize()`) for speed/cost
- **OR:** Use AI-based for consistency (slower, costs more)

### Step 5: Update UI

- Add `function_category` to `JobData` interface
- Add Function column to table (next to Department)
- Display function label using `getCategoryLabel()`

---

## Questions to Answer

1. **Consistency vs Cost:** Do you want AI-based (consistent, costs ~$0.0001/job) or keyword-based (fast, free, less consistent)?

2. **Backfill Strategy:** 
   - Option A: Use keyword for backfill (fast, cheap, inconsistent with new jobs)
   - Option B: Use AI for backfill (slower, costs more, consistent)

3. **Display:** Function label (e.g., "Backend Engineering") or function group (e.g., "Engineering")?

---

## Next Steps

1. **Decide on consistency strategy** (AI vs keyword)
2. **Create migration** with CHECK constraint
3. **Update extraction logic** to include function_category
4. **Create backfill script** (test with small batch first)
5. **Update UI** to display function column
