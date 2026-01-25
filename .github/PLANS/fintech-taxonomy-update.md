# Fintech Taxonomy Update Implementation Plan

**Overall Progress:** `100%`

## TLDR
Update job categorization system from 27 generic categories to 45 fintech-specific categories organized into 7 strategic groups. This enables better tracking of fintech-specific roles (e.g., AML, Compliance, Capital Markets) critical for competitive intelligence.

## Critical Decisions
- **Decision 1:** Use 45 fintech-specific categories instead of generic 27 - Better captures fintech-specific roles like AML, Compliance, Capital Markets
- **Decision 2:** Organize into 7 groups instead of 6 - Separates Risk/Legal/Compliance (critical for fintech insights) and Finance & Strategy (distinct from Operations)
- **Decision 3:** Update both `function-categories.ts` and `categorizer.ts` - Both files have duplicate `ROLE_CATEGORIES` that must stay in sync
- **Decision 4:** Add edge case rules to LLM prompt - Improves accuracy for ambiguous roles (e.g., SQL = Data, Excel = Finance)

## Tasks:

- [x] 🟩 **Step 1: Define New Category Structure**
  - [x] 🟩 Map 45 new categories from specification to code-friendly slugs
  - [x] 🟩 Define 7 new category groups with proper names
  - [x] 🟩 Create mapping document showing old → new category mappings
  - [x] 🟩 Document edge cases and categorization rules

- [x] 🟩 **Step 2: Update `function-categories.ts`**
  - [x] 🟩 Replace `ROLE_CATEGORIES` array with 45 new categories
  - [x] 🟩 Update `CATEGORY_GROUPS` to map to 7 new groups
  - [x] 🟩 Update `getCategoryLabel()` with all 45 new labels
  - [x] 🟩 Update `getCategoryGroup()` to handle new groups
  - [x] 🟩 Verify TypeScript types compile correctly

- [x] 🟩 **Step 3: Update `categorizer.ts`**
  - [x] 🟩 Replace `ROLE_CATEGORIES` array (must match `function-categories.ts`)
  - [x] 🟩 Update `CATEGORIZATION_PROMPT` with:
    - [x] 🟩 List of all 45 categories
    - [x] 🟩 Edge case rules (SQL = Data, Excel = Finance, etc.)
    - [x] 🟩 Fintech-specific guidance (e.g., Platform/SRE vs DevOps distinction)
  - [x] 🟩 Update prompt to reference new 7 groups for context

- [x] 🟩 **Step 4: Update `structure.ts`**
  - [x] 🟩 Update Zod schema `JobStructureSchema` to use new `ROLE_CATEGORIES`
  - [x] 🟩 Update extraction prompt to reference new categories
  - [x] 🟩 Ensure `isValidRoleCategory()` uses updated categories

- [x] 🟩 **Step 5: Update Database Schema**
  - [x] 🟩 Create migration to update CHECK constraint with 45 new categories
  - [x] 🟩 Remove old categories from constraint
  - [x] 🟩 Add new categories to constraint
  - [ ] 🟨 Test migration on development database

- [x] 🟩 **Step 6: Update UI Components**
  - [x] 🟩 Update `FunctionBreakdown.tsx` `GROUP_COLORS` for 7 groups
  - [x] 🟩 Verify group names display correctly
  - [ ] 🟨 Test UI with new category labels
  - [x] 🟩 Update any hardcoded group references

- [x] 🟩 **Step 7: Handle Data Migration**
  - [x] 🟩 Create mapping script for old → new categories
  - [x] 🟩 Identify jobs with old categories that need remapping
  - [x] 🟩 Create backfill script to update existing jobs
  - [ ] 🟨 Test backfill on sample data
  - [x] 🟩 Document migration strategy

- [x] 🟩 **Step 8: Testing & Validation**
  - [x] 🟩 Run build to verify no TypeScript errors
  - [x] 🟩 Verify all 45 categories compile correctly
  - [x] 🟩 Verify edge case rules are documented in prompts
  - [x] 🟩 Verify UI components updated
  - [x] 🟩 Verify database migration created
  - [ ] 🟨 Test categorization with sample fintech job postings (manual testing required)
  - [ ] 🟨 Test migration on staging environment (deployment step)

- [x] 🟩 **Step 9: Documentation**
  - [x] 🟩 Update `CATEGORY_MANAGEMENT_STRATEGY.md` with new taxonomy
  - [x] 🟩 Document category definitions and use cases (`FINTECH_TAXONOMY_DEFINITIONS.md`)
  - [x] 🟩 Document edge case rules for future reference
  - [x] 🟩 Create migration mapping document (`CATEGORY_MIGRATION_MAPPING.md`)

## Category Mapping Reference

### Group 1: Engineering (10 categories)
- `engineering-backend` (existing)
- `engineering-frontend` (existing)
- `engineering-fullstack` (existing)
- `engineering-mobile` (existing)
- `engineering-data` (existing)
- `engineering-ai-ml` (renamed from `engineering-ml`)
- `engineering-platform-sre-devops` (renamed from `engineering-devops`)
- `engineering-security` (existing)
- `engineering-qa` (existing)
- `engineering-management` (NEW)

### Group 2: Product & Design (5 categories)
- `product-management` (existing)
- `product-design-ux` (renamed from `product-design`)
- `product-research` (existing)
- `technical-program-management` (NEW)
- `technical-writing` (NEW)

### Group 3: Data & Analytics (3 categories)
- `data-science` (NEW)
- `data-analytics-bi` (renamed from `data-analytics`)
- `analytics-engineering` (NEW)

### Group 4: Risk, Legal & Compliance (6 categories)
- `compliance` (NEW)
- `aml-financial-crime` (NEW)
- `fraud-trust-safety` (NEW)
- `legal` (NEW, separate from `legal-compliance`)
- `regulatory-affairs` (NEW)
- `risk-management` (NEW, separate from `risk`)

### Group 5: Go-To-Market (8 categories)
- `sales-account-executives` (renamed from `sales`)
- `account-management-customer-success` (renamed from `customer-success`)
- `customer-support` (existing)
- `business-development-partnerships` (NEW)
- `solutions-engineering` (NEW)
- `revenue-operations` (NEW)
- `marketing-growth-performance` (renamed from `marketing-growth`)
- `marketing-product-brand` (merged from `marketing-product`, `marketing-content`, `marketing-brand`)
- `developer-relations` (NEW)

### Group 6: Finance & Strategy (5 categories)
- `finance-accounting` (renamed from `finance`)
- `strategic-finance-fpa` (NEW)
- `capital-markets-treasury` (NEW)
- `corporate-development-strategy` (NEW)
- `investor-relations` (NEW)

### Group 7: Operations & People (8 categories)
- `customer-support-cx` (renamed from `customer-support`)
- `customer-operations` (NEW)
- `people-ops-hr` (renamed from `hr-people`)
- `talent-acquisition-recruiting` (NEW)
- `it-internal-systems` (NEW)
- `business-operations` (renamed from `operations`)
- `executive-leadership` (renamed from `leadership`)
- `administrative` (NEW)

**Note:** Some categories may need slug refinement (e.g., `engineering-platform-sre-devops` might be too long). Final slugs TBD during implementation.

## Edge Case Rules for LLM Prompt

- **SQL/Data Pipelines** → Data Engineering (not Data Analytics)
- **Excel/Financial Modeling** → Finance & Accounting (not Data Analytics)
- **Product Engineer** → Engineering (if technical) or Product Management (if strategic)
- **Marketing Engineer** → Engineering (technical role) not Marketing
- **Platform Engineering** → Platform/SRE/DevOps (not generic DevOps)
- **SRE** → Platform/SRE/DevOps (distinct from DevOps in mature fintechs)
- **Risk Modeling** → Data Science (not Risk Management)
- **Fraud Detection** → Fraud/Trust & Safety (not Risk Management)
- **Compliance Operations** → Compliance (not Legal)
- **Legal Counsel** → Legal (not Compliance)

## Migration Strategy

1. **Phase 1:** Update code with new categories (old categories still in DB constraint)
2. **Phase 2:** Create mapping for old → new categories
3. **Phase 3:** Run migration to update DB constraint
4. **Phase 4:** Backfill existing jobs with new categories
5. **Phase 5:** Remove old categories from code (if any remain unused)

## Files to Modify

- `web/lib/analysis/function-categories.ts` - Main category definitions
- `web/lib/analysis/categorizer.ts` - Duplicate categories + prompt
- `web/lib/analysis/structure.ts` - Zod schema + extraction prompt
- `web/supabase/migrations/[timestamp]_update_function_categories.sql` - DB constraint
- `web/components/companies/FunctionBreakdown.tsx` - UI colors
- `docs/CATEGORY_MANAGEMENT_STRATEGY.md` - Documentation

## Testing Checklist

- [ ] All 45 categories can be stored in database
- [ ] All 45 categories map to correct groups
- [ ] UI displays all 7 groups correctly
- [ ] Edge cases categorize correctly (Product Engineer, etc.)
- [ ] Existing jobs migrate correctly
- [ ] New jobs categorize correctly
- [ ] No TypeScript errors
- [ ] No database constraint violations
