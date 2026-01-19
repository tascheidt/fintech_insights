# Silver Layer Database & Analysis Logic Audit

**Date:** January 2025  
**Purpose:** Audit existing database schema and analysis logic for Epic 2 (Analysis & Insights) - "Silver Layer" implementation

---

## 1. Database Schema Status

### 1.1 Core Tables

#### `job_postings` Table
**Location:** `web/supabase/migrations/20260117000000_initial_schema.sql`

**Existing Columns:**
- `id` (UUID, PK)
- `company_id` (UUID, FK → companies)
- `external_id` (TEXT) - ATS identifier
- `title` (TEXT) ✅
- `department` (TEXT) ✅ **EXISTS** - Raw department from ATS
- `team` (TEXT) ✅ **EXISTS**
- `location` (TEXT) ✅
- `location_type` (TEXT) ✅ - remote/hybrid/onsite
- `description_html` (TEXT) ✅
- `description_text` (TEXT) ✅ - Plain text version
- `commitment` (TEXT) ✅ - full-time/part-time/contract
- `posted_date` (TIMESTAMPTZ)
- `first_seen_date` (TIMESTAMPTZ)
- `last_seen_date` (TIMESTAMPTZ)
- `closed_date` (TIMESTAMPTZ)
- `is_active` (BOOLEAN)
- `url` (TEXT)

**Missing for Silver Layer:**
- ❌ `standardized_department` (TEXT) - Normalized department name
- ❌ `seniority_level` (TEXT) - junior/mid/senior/staff/principal/executive
- ❌ `salary_min` (INTEGER) - Minimum salary
- ❌ `salary_max` (INTEGER) - Maximum salary
- ❌ `salary_currency` (TEXT) - USD/CAD/EUR/etc
- ❌ `tech_stack` (JSONB) - Array of technologies/skills
- ❌ `keywords` (TEXT[]) - Extracted keywords/tags
- ❌ `summary` (TEXT) - AI-generated job summary
- ❌ `normalized_title` (TEXT) - Standardized job title
- ❌ `function_category` (TEXT) - Maps to ROLE_CATEGORIES enum

#### `strategic_insights` Table
**Location:** `web/supabase/migrations/20260117000000_initial_schema.sql` + `20260118000000_advanced_insights.sql`

**Existing Columns:**
- `id` (UUID, PK)
- `job_posting_id` (UUID, FK → job_postings)
- `run_date` (TIMESTAMPTZ)
- `category` (TEXT) ✅ - Strategic category
- `insight_summary` (TEXT) ✅ - Strategic analysis summary
- `strategic_signals` (JSONB) ✅ - Array of signals
- `is_new_direction` (BOOLEAN) ✅
- `confidence` (TEXT) ✅ - high/medium/low
- `novelty_score` (INTEGER) ✅ - 1-10 scale
- `novelty_reasoning` (TEXT) ✅
- `is_executive_movement` (BOOLEAN) ✅
- `executive_context` (TEXT) ✅
- `strategic_hypothesis` (TEXT) ✅
- `web_context` (JSONB) ✅ - Web search results
- `model_reasoning` (TEXT) ✅

**Status:** ✅ **FULLY IMPLEMENTED** - Strategic analysis table exists with advanced fields

#### `job_templates` Table
**Location:** `web/supabase/migrations/20260117000000_initial_schema.sql`

**Existing Columns:**
- `id` (UUID, PK)
- `job_posting_id` (UUID, FK → job_postings)
- `role_category` (TEXT) ✅ - Maps to ROLE_CATEGORIES
- `extracted_sections` (JSONB) ✅ - {summary, responsibilities, requirements, nice_to_have, benefits}
- `quality_score` (INTEGER) ✅ - 1-5 rating
- `notes` (TEXT)
- `created_at` (TIMESTAMPTZ)

**Status:** ✅ **EXISTS** - Template extraction table with role categorization

#### `company_insights` Table
**Location:** `web/supabase/migrations/20260120000000_company_insights.sql`

**Existing Columns:**
- `id` (UUID, PK)
- `company_id` (UUID, FK → companies)
- `analysis_period_start` (TIMESTAMPTZ)
- `analysis_period_end` (TIMESTAMPTZ)
- `generated_at` (TIMESTAMPTZ)
- `executive_summary` (TEXT) ✅
- `strategic_hypothesis` (TEXT) ✅
- `confidence` (TEXT) ✅
- `core_functions` (JSONB) ✅ - Function breakdown stats
- `function_changes` (JSONB) ✅ - Changes vs previous period
- `hiring_trends` (JSONB) ✅
- `new_directions` (JSONB) ✅
- `is_public_company` (BOOLEAN) ✅
- `stated_strategy` (TEXT) ✅
- `financial_context` (JSONB) ✅
- `analyst_reports` (JSONB) ✅
- `research_sources` (JSONB) ✅
- `research_quality_score` (INTEGER) ✅
- `alignment_analysis` (TEXT) ✅
- `discrepancies` (JSONB) ✅
- `strategic_implications` (TEXT) ✅
- `model_reasoning` (TEXT) ✅
- `research_depth` (TEXT) ✅
- `previous_insight_id` (UUID) ✅
- `generation_cost_estimate` (DECIMAL) ✅

**Status:** ✅ **FULLY IMPLEMENTED** - Company-level strategic insights with deep research

#### `insight_conversations` Table
**Location:** `web/supabase/migrations/20260118000000_advanced_insights.sql`

**Existing Columns:**
- `id` (UUID, PK)
- `insight_id` (UUID, FK → strategic_insights)
- `user_id` (UUID, FK → profiles)
- `messages` (JSONB) ✅ - Chat history
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Status:** ✅ **EXISTS** - Conversational follow-up on insights

#### `company_insight_conversations` Table
**Location:** `web/supabase/migrations/20260120000000_company_insights.sql`

**Existing Columns:**
- `id` (UUID, PK)
- `company_insight_id` (UUID, FK → company_insights)
- `user_id` (UUID, FK → profiles)
- `messages` (JSONB) ✅
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Status:** ✅ **EXISTS** - Conversational follow-up on company insights

### 1.2 Reporting Tables

**Status:** ❌ **NOT FOUND** - No dedicated `reports` or `newsletters` tables exist

**Note:** Reporting appears to be handled via:
- Email generation from templates (`templates/email_report.html`)
- Cron job at `/api/cron/report` (weekly Monday 8 AM)
- No persistent report storage in database

---

## 2. Missing Fields for "Silver Layer"

### 2.1 Required Additions to `job_postings` Table

For a complete "Silver Layer" (standardized, structured job data), add:

```sql
-- Standardized Department (normalized from raw department)
ALTER TABLE job_postings 
  ADD COLUMN standardized_department TEXT;

-- Seniority Level (extracted from title/description)
ALTER TABLE job_postings 
  ADD COLUMN seniority_level TEXT CHECK (seniority_level IN ('intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'lead', 'executive'));

-- Salary Information
ALTER TABLE job_postings 
  ADD COLUMN salary_min INTEGER,
  ADD COLUMN salary_max INTEGER,
  ADD COLUMN salary_currency TEXT DEFAULT 'USD';

-- Tech Stack (extracted technologies/skills)
ALTER TABLE job_postings 
  ADD COLUMN tech_stack JSONB DEFAULT '[]';

-- Keywords/Tags (extracted from description)
ALTER TABLE job_postings 
  ADD COLUMN keywords TEXT[] DEFAULT '{}';

-- AI-Generated Summary
ALTER TABLE job_postings 
  ADD COLUMN summary TEXT;

-- Normalized Title (standardized job title)
ALTER TABLE job_postings 
  ADD COLUMN normalized_title TEXT;

-- Function Category (maps to ROLE_CATEGORIES)
ALTER TABLE job_postings 
  ADD COLUMN function_category TEXT REFERENCES job_templates(role_category);
```

### 2.2 Indexes Needed

```sql
CREATE INDEX idx_job_postings_standardized_dept ON job_postings(standardized_department);
CREATE INDEX idx_job_postings_seniority ON job_postings(seniority_level);
CREATE INDEX idx_job_postings_function_category ON job_postings(function_category);
CREATE INDEX idx_job_postings_keywords ON job_postings USING GIN(keywords);
CREATE INDEX idx_job_postings_tech_stack ON job_postings USING GIN(tech_stack);
```

---

## 3. Existing Analysis Logic

### 3.1 AI/LLM Functions

#### ✅ Strategic Analysis (`web/lib/analysis/strategic.ts`)
- **Function:** `analyzeJob(companyName, job)`
- **Model:** Gemini 3 Flash Preview
- **Output:** `AnalyzeResult` with category, insight_summary, strategic_signals, is_new_direction, confidence
- **Status:** ✅ **PRODUCTION READY**

#### ✅ Advanced Strategic Analysis (`web/lib/analysis/advanced-strategic.ts`)
- **Function:** `analyzeJobAdvanced(options)`
- **Model:** Gemini 3 Pro Preview (with fallback to Flash)
- **Features:**
  - Historical context comparison
  - Web search grounding (Google Search tool)
  - Novelty scoring (1-10)
  - Executive movement detection
  - Strategic hypothesis generation
- **Output:** `AdvancedAnalyzeResult` with extended fields
- **Status:** ✅ **PRODUCTION READY**

#### ✅ Job Categorization (`web/lib/analysis/categorizer.ts`)
- **Function:** `categorizePosting(jobTitle, companyName, description)`
- **Model:** Gemini 3 Flash Preview
- **Output:** `JobCategoryResult` with:
  - `role_category` (from ROLE_CATEGORIES enum)
  - `extracted_sections` (summary, responsibilities, requirements, nice_to_have, benefits)
  - `quality_score` (1-5)
- **Quick Categorization:** `quickCategorize(jobTitle)` - No API call, regex-based
- **Status:** ✅ **PRODUCTION READY**

#### ✅ Company-Level Insights (`web/lib/analysis/company-insights.ts`)
- **Function:** `generateCompanyInsight(companyId, companyName, options)`
- **Model:** Gemini 3 Flash Preview
- **Features:**
  - Extended historical context (90-day periods)
  - Deep research (public company detection, financial context, analyst reports)
  - Function breakdown and trends
  - Alignment analysis (hiring vs stated strategy)
  - Discrepancy detection
- **Output:** `CompanyInsight` with comprehensive analysis
- **Status:** ✅ **PRODUCTION READY**

#### ✅ Function Categories (`web/lib/analysis/function-categories.ts`)
- **Function:** `categorizeJobs(jobs)` - Batch categorization
- **Function:** `getGroupStats(functionStats)` - Group-level aggregation
- **ROLE_CATEGORIES:** 36 predefined categories (engineering-backend, product-management, etc.)
- **Status:** ✅ **PRODUCTION READY** - Pure TypeScript, no API calls

#### ✅ Context Builder (`web/lib/analysis/context-builder.ts`)
- **Function:** `buildHistoricalContext(companyId, days)` - Basic context
- **Function:** `buildExtendedHistoricalContext(companyId, days)` - Extended with function analysis
- **Output:** Historical hiring patterns, trends, executive hires, department breakdown
- **Status:** ✅ **PRODUCTION READY**

#### ✅ Company Research (`web/lib/analysis/company-research.ts`)
- **Function:** `detectCompanyType(companyName)` - Public vs private detection
- **Function:** `performDeepResearch(companyName, options)` - Web research with verification
- **Output:** Research results with sources, financial context, stated strategy
- **Status:** ✅ **PRODUCTION READY**

### 3.2 TypeScript Types/Interfaces

#### Job Analysis Types
- ✅ `JobData` (`web/lib/scrapers/types.ts`) - Raw job data structure
- ✅ `JobCategoryResult` (`web/lib/analysis/categorizer.ts`) - Categorization result
- ✅ `AnalyzeResult` (`web/lib/analysis/strategic.ts`) - Basic strategic analysis
- ✅ `AdvancedAnalyzeResult` (`web/lib/analysis/advanced-strategic.ts`) - Advanced analysis
- ✅ `CompanyInsight` (`web/lib/analysis/company-insights.ts`) - Company-level insight
- ✅ `FunctionStats` (`web/lib/analysis/function-categories.ts`) - Function breakdown stats
- ✅ `HistoricalContext` (`web/lib/analysis/context-builder.ts`) - Historical patterns
- ✅ `ExtendedHistoricalContext` (`web/lib/analysis/context-builder.ts`) - Extended context

**Status:** ✅ **COMPREHENSIVE TYPE SYSTEM EXISTS**

### 3.3 Reusable Components

#### ✅ Job Processing Pipeline (`web/lib/jobs/`)
- `analyzer.ts` - Analysis stage runner
- `processor.ts` - Job ingestion and processing
- `runner.ts` - Job run orchestration
- `progress.ts` - Progress tracking
- **Status:** ✅ **PRODUCTION READY**

---

## 4. Summary & Recommendations

### 4.1 What Exists ✅

1. **Strategic Analysis Tables:**
   - ✅ `strategic_insights` - Job-level strategic analysis (with advanced fields)
   - ✅ `company_insights` - Company-level strategic insights
   - ✅ `job_templates` - Job categorization and template extraction
   - ✅ `insight_conversations` - Chat follow-ups on insights

2. **Analysis Logic:**
   - ✅ Strategic analysis (basic + advanced)
   - ✅ Job categorization (36 categories)
   - ✅ Function breakdown and trends
   - ✅ Company-level insights with deep research
   - ✅ Historical context building

3. **Type System:**
   - ✅ Comprehensive TypeScript interfaces
   - ✅ Type-safe analysis functions

### 4.2 What's Missing for Silver Layer ❌

1. **Structured Job Data Fields:**
   - ❌ `standardized_department` - Normalized department
   - ❌ `seniority_level` - Extracted seniority
   - ❌ `salary_min/max/currency` - Salary information
   - ❌ `tech_stack` (JSONB) - Technologies/skills
   - ❌ `keywords` (TEXT[]) - Extracted keywords
   - ❌ `summary` - AI-generated summary
   - ❌ `normalized_title` - Standardized title
   - ❌ `function_category` - Direct link to role category

2. **Analysis Functions:**
   - ❌ Seniority extraction from title/description
   - ❌ Tech stack extraction from description
   - ❌ Keyword extraction
   - ❌ Salary parsing/extraction
   - ❌ Job summary generation (separate from strategic insight)

3. **Reporting Tables:**
   - ❌ No persistent `reports` table
   - ❌ No `newsletters` table

### 4.3 Recommendations

#### Immediate Actions for Silver Layer:

1. **Create Migration for Silver Layer Fields:**
   ```sql
   -- Migration: 20260121000000_silver_layer_fields.sql
   -- Add standardized fields to job_postings table
   ```

2. **Implement Extraction Functions:**
   - `extractSeniority(title, description)` - Use Gemini to extract seniority level
   - `extractTechStack(description)` - Extract technologies/skills
   - `extractKeywords(description)` - Extract key terms
   - `extractSalary(description)` - Parse salary ranges
   - `generateJobSummary(title, description)` - Generate concise summary

3. **Leverage Existing Logic:**
   - ✅ Reuse `categorizePosting()` for function_category
   - ✅ Reuse `quickCategorize()` for fast categorization
   - ✅ Reuse `analyzeJobAdvanced()` for strategic analysis (already exists)

4. **Create Silver Layer Processing Pipeline:**
   - Add "silver" stage to job processing pipeline
   - Run extraction functions after job ingestion
   - Store results in new `job_postings` columns

### 4.4 Estimated Effort

- **Database Migration:** 1-2 hours
- **Extraction Functions:** 4-6 hours (5 functions × 1 hour each)
- **Pipeline Integration:** 2-3 hours
- **Testing & Validation:** 2-3 hours
- **Total:** ~10-14 hours

---

## 5. Conclusion

**Good News:** The foundation for analysis and insights is **strongly established**:
- ✅ Strategic analysis tables exist with advanced fields
- ✅ Company-level insights with deep research
- ✅ Comprehensive AI analysis functions using Gemini 3
- ✅ Job categorization system (36 categories)
- ✅ Historical context and trend analysis

**Gap:** The "Silver Layer" (standardized, structured job data) is **partially missing**:
- ✅ Raw job data exists (`department`, `title`, `description_text`)
- ❌ Standardized fields missing (`standardized_department`, `seniority_level`, `tech_stack`, etc.)
- ❌ Extraction functions not yet implemented

**Recommendation:** Build on existing analysis infrastructure. The categorization and strategic analysis logic can be reused. Focus on adding extraction functions for seniority, tech stack, keywords, and salary parsing.
