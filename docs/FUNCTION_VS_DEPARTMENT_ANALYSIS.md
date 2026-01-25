# Function Categories vs Standardized Department Analysis

**Date:** January 24, 2026  
**Purpose:** Compare title-based function categorization with AI-extracted standardized_department to determine if they overlap significantly or serve different purposes.

---

## Executive Summary

This analysis compares two different categorization approaches:
1. **Function Categories** (title-based): Uses keyword matching on job titles to categorize roles into specific functions (e.g., "engineering-backend", "product-management", "marketing-growth")
2. **Standardized Department** (AI-extracted): Uses Gemini AI to extract organizational department from job descriptions (e.g., "Engineering", "Sales", "Marketing", "Product")

**Key Finding:** These serve **different but complementary purposes**:
- **Department** = Organizational unit (where the role sits in the company structure)
- **Function** = Role specialization and skills (what the person actually does)

---

## Current Implementation

### Function Categorization (Title-Based)

**Location:** `web/lib/analysis/function-categories.ts`

- **Method:** `quickCategorize()` - keyword matching on job titles
- **No AI/API calls** - fast, deterministic
- **Granularity:** 35+ specific categories grouped into 6 high-level groups:
  - Engineering (9 subcategories: backend, frontend, fullstack, mobile, data, ML, DevOps, security, QA)
  - Product (3 subcategories: management, design, research)
  - Marketing (4 subcategories: growth, product, content, brand)
  - Go-to-Market (3 subcategories: sales, customer success, support)
  - Operations (6 subcategories: operations, finance, legal, HR, data analytics, risk)
  - Leadership (1 category)
  - Other

**Used in:**
- "Hiring by Function" card in company insights (`/companies/[slug]/insights/[id]`)
- Function breakdown analysis for strategic insights
- Function trend analysis (comparing periods)

### Standardized Department (AI-Extracted)

**Location:** `web/lib/analysis/structure.ts`

- **Method:** `extractJobStructure()` - Gemini 3 Flash AI extraction from job descriptions
- **AI-powered** - extracts from full job description context
- **Granularity:** High-level organizational departments:
  - Common values: "Engineering", "Sales", "Marketing", "Product", "Operations", "Finance", "Legal", "HR", "Customer Success", "Support"
  - Normalized to standard names (e.g., "Engineering" not "Software Engineering" or "Tech")

**Used in:**
- Department column in job listings (`JobHistoryView`)
- Department breakdown in historical context
- Department trend analysis
- Strategic analysis prompts

**Processing:**
- Extracted for **every job** during ingestion (`extractAndUpdateStructure()`)
- Runs asynchronously in parallel (doesn't block ingestion)
- Only requires `description_text` to be present

---

## Data Flow Comparison

### Function Categorization Flow

```
Job Scraped → Title Available → quickCategorize(title) → Function Category
                                                         ↓
                                              Function Group (Engineering, Product, etc.)
```

**Characteristics:**
- ✅ Fast (no API calls)
- ✅ Works immediately after scraping (only needs title)
- ✅ Consistent (deterministic keyword matching)
- ⚠️ Limited by title keywords (may miss context)
- ⚠️ Can't distinguish organizational structure

### Standardized Department Flow

```
Job Scraped → Description Available → extractJobStructure(title, description) → standardized_department
                                                      ↓
                                            Gemini AI Extraction
```

**Characteristics:**
- ✅ Uses full job description context
- ✅ Understands organizational structure
- ✅ Handles edge cases and variations
- ⚠️ Requires API call (costs, latency)
- ⚠️ Only works after description is available
- ⚠️ May vary slightly between extractions

---

## Conceptual Differences

### Department (Organizational Structure)

**Represents:** Where the role sits in the company's organizational chart

**Examples:**
- "Engineering" - All technical roles in the engineering org
- "Sales" - All revenue-generating roles
- "Product" - Product organization roles
- "Operations" - Back-office functions (finance, legal, HR, etc.)

**Use Cases:**
- Understanding organizational structure
- Department-level hiring trends
- Budget allocation by department
- Reporting structure analysis

### Function (Role Specialization)

**Represents:** What the person actually does / their skill specialization

**Examples:**
- "engineering-backend" - Backend engineering specialization
- "product-management" - Product management function
- "marketing-growth" - Growth marketing specialization
- "data-analytics" - Data analysis function (could be in Engineering or Operations)

**Use Cases:**
- Skill-based hiring analysis
- Function-level trends (e.g., backend vs frontend engineering)
- Cross-department function analysis (e.g., data roles in Engineering vs Operations)
- More granular insights than department-level

---

## Overlap Analysis

### Expected Mappings

| Standardized Department | Expected Function Groups | Notes |
|------------------------|-------------------------|-------|
| Engineering | Engineering | Direct match |
| Product | Product | Direct match |
| Marketing | Marketing | Direct match |
| Sales | Go-to-Market | Sales is part of GTM |
| Customer Success | Go-to-Market | Customer Success is part of GTM |
| Customer Support | Go-to-Market | Support is part of GTM |
| Operations | Operations | Direct match |
| Finance | Operations | Finance is part of Operations group |
| Legal | Operations | Legal is part of Operations group |
| HR / People | Operations | HR is part of Operations group |
| Data / Analytics | Operations OR Engineering | Could be in either org |
| Risk | Operations | Risk is part of Operations group |
| Compliance | Operations | Compliance is part of Operations group |
| Leadership | Leadership | Direct match |

### Potential Mismatches

**Scenario 1: Cross-Department Functions**
- **Example:** "Data Analyst" role
  - Department: "Operations" (reports to CFO)
  - Function: "data-analytics" (function group: Operations) ✅ Aligned
  - OR Department: "Engineering" (reports to CTO)
  - Function: "data-analytics" (function group: Operations) ⚠️ Mismatch at group level

**Scenario 2: Title Doesn't Reflect Department**
- **Example:** "Product Manager" role
  - Department: "Engineering" (embedded PM in engineering team)
  - Function: "product-management" (function group: Product) ⚠️ Mismatch

**Scenario 3: Generic Titles**
- **Example:** "Manager" role
  - Department: "Sales" (from description context)
  - Function: "other" (title too generic) ⚠️ Function categorization fails

**Scenario 4: Department Ambiguity**
- **Example:** "Designer" role
  - Department: "Product" (from description)
  - Function: "product-design" (function group: Product) ✅ Aligned
  - OR Department: "Marketing" (from description)
  - Function: "product-design" (function group: Product) ⚠️ Mismatch

---

## Analysis Script

Created `web/scripts/analyze-function-vs-department.ts` to analyze actual data:

**Features:**
1. **Distribution Analysis:** Shows top standardized_department values and function groups
2. **Cross-Tabulation:** Shows how departments map to function groups
3. **Mismatch Detection:** Identifies cases where department and function don't align
4. **Coverage Analysis:** Shows how many jobs have both, one, or neither
5. **Recommendations:** Provides guidance based on alignment rate

**Usage:**
```bash
# Analyze all jobs with standardized_department
npx tsx --env-file=.env.local web/scripts/analyze-function-vs-department.ts

# Limit to first 500 jobs
npx tsx --env-file=.env.local web/scripts/analyze-function-vs-department.ts --limit=500

# Random sample of 100 jobs
npx tsx --env-file=.env.local web/scripts/analyze-function-vs-department.ts --sample=100
```

---

## Recommendations

### Option 1: Keep Both Fields (Recommended)

**Rationale:**
- They serve different purposes (organizational vs functional)
- Function provides more granular insights than department
- Department provides organizational context that function lacks
- Both are useful for different types of analysis

**Implementation:**
- Clarify naming/display to reduce confusion:
  - Department column → "Department" (organizational unit)
  - Function breakdown → "Hiring by Function" (role specialization)
- Add tooltips/help text explaining the difference
- Consider showing both in job listings (Department + Function)

**Pros:**
- ✅ Captures both dimensions
- ✅ More granular analysis possible
- ✅ Better insights for strategic analysis

**Cons:**
- ⚠️ May be confusing for users
- ⚠️ Requires maintaining both systems

### Option 2: Collapse to Standardized Department Only

**Rationale:**
- Simpler mental model (one categorization system)
- Department is AI-extracted (more accurate)
- Function categorization is title-based (less reliable)

**Implementation:**
- Remove function categorization from "Hiring by Function" card
- Use standardized_department breakdown instead
- Update all function-based analysis to use department

**Pros:**
- ✅ Simpler for users
- ✅ Single source of truth
- ✅ AI-extracted (more accurate)

**Cons:**
- ❌ Less granular (can't distinguish backend vs frontend engineering)
- ❌ Loses functional insights (e.g., data roles across departments)
- ❌ Less useful for strategic analysis

### Option 3: Enhance Function Categorization with Department

**Rationale:**
- Use department as a hint/fallback for function categorization
- Improve accuracy by combining both signals

**Implementation:**
- Update `categorizeJobs()` to accept `standardized_department` parameter
- Use department to disambiguate ambiguous titles
- Fallback to department-based grouping if function categorization fails

**Example:**
```typescript
function categorizeJob(
  title: string, 
  standardizedDepartment?: string | null
): RoleCategory {
  const functionCategory = quickCategorize(title);
  
  // If categorized as "other" but have department, use department as hint
  if (functionCategory === "other" && standardizedDepartment) {
    return departmentToFunction(standardizedDepartment);
  }
  
  // If mismatch detected, prefer department context
  if (standardizedDepartment && !isAligned(functionCategory, standardizedDepartment)) {
    // Use department as tie-breaker for ambiguous cases
  }
  
  return functionCategory;
}
```

**Pros:**
- ✅ More accurate categorization
- ✅ Handles edge cases better
- ✅ Maintains granularity

**Cons:**
- ⚠️ More complex logic
- ⚠️ Still requires both fields

---

## Questions for Clarification

1. **User Confusion:** Have users expressed confusion about having both "Department" and "Function"?
2. **Use Cases:** What are the primary use cases for each field?
   - Is department used for organizational reporting?
   - Is function used for skill-based analysis?
3. **Granularity Needs:** Do users need granular function breakdowns (backend vs frontend) or is department-level sufficient?
4. **Display:** Should we show both fields in job listings, or just one?
5. **Strategic Insights:** Which field is more valuable for strategic insights?

---

## Next Steps

1. **Run Analysis Script:** Execute `analyze-function-vs-department.ts` on production data to get actual alignment metrics
2. **Review Mismatches:** Analyze specific cases where department and function don't align
3. **User Research:** Survey users about confusion/needs
4. **Decision:** Choose one of the three options based on data and user needs
5. **Implementation:** Execute chosen approach

---

## Related Files

- `web/lib/analysis/function-categories.ts` - Function categorization logic
- `web/lib/analysis/structure.ts` - Standardized department extraction
- `web/lib/analysis/context-builder.ts` - Uses both for insights
- `web/components/companies/FunctionBreakdown.tsx` - "Hiring by Function" card
- `web/components/companies/JobHistoryView.tsx` - Department column display
- `web/scripts/analyze-function-vs-department.ts` - Analysis script
