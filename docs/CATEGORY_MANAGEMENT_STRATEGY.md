# Category Management Strategy

**Date:** January 27, 2026  
**Status:** ✅ Updated to 45 fintech-specific categories across 7 groups

---

## Summary

1. ✅ **Restored "other" category** - Jobs that can't be categorized now use "other" instead of NULL
2. 📋 **LLM Research Prompt** - Created comprehensive prompt for researching job taxonomies
3. 📊 **Missing Categories Identified** - 23+ missing categories documented
4. 🎯 **Pragmatic Management Approach** - Three options with recommendations

---

## 1. Code Changes Made

### ✅ Restored "other" for Uncategorized Jobs

**Files Updated:**
- `web/lib/analysis/structure.ts`:
  - Changed Zod schema from `.nullable()` to required (defaults to "other")
  - Updated prompt to use "other" instead of null
  - Updated `extractPartialStructure()` to return "other" instead of null
  - Updated `JobStructureForDB` interface to require `function_category` (not nullable)

**Result:**
- All jobs now have a `function_category` (never NULL)
- Uncategorized jobs use "other"
- "Other" group appears in UI statistics
- Better visibility into uncategorized jobs

---

## 2. LLM Research Prompt

**Location:** `docs/JOB_CATEGORY_TAXONOMY_RESEARCH.md`

**Use this prompt with Gemini 3 Pro or Claude:**

```
You are a job taxonomy expert researching comprehensive role categorization systems for fintech companies. I need you to:

1. **Research Standard Taxonomies:**
   - O*NET-SOC (Standard Occupational Classification) - How do they categorize tech/fintech roles?
   - Lightcast Occupation Taxonomy (LOT) - What categories exist for fintech?
   - Common ATS taxonomies (Greenhouse, Lever, Workable) - What standard categories do they use?
   - Industry-specific taxonomies (e.g., fintech, SaaS, tech startups)

2. **Identify Missing Categories:**
   Based on this current taxonomy:
   - Engineering: backend, frontend, fullstack, mobile, data, ML, DevOps, security, QA
   - Product: management, design, research
   - Marketing: growth, product, content, brand
   - Go-to-Market: sales, customer success, support
   - Operations: operations, finance, legal-compliance, hr-people, data-analytics, risk
   - Leadership
   - Other

   What important fintech roles are missing? Consider:
   - Communications / PR
   - UX Design (vs Product Design)
   - Product Operations
   - Compliance (vs Legal-Compliance)
   - AML (Anti-Money Laundering)
   - Regulatory Affairs
   - Business Development (vs Sales)
   - Partnerships
   - Investor Relations
   - Corporate Development
   - Security Operations (vs Security Engineering)
   - Platform Engineering (vs DevOps)
   - Site Reliability Engineering (SRE) - separate from DevOps?
   - Data Science (vs Data Analytics)
   - Business Intelligence
   - Revenue Operations (RevOps)
   - Customer Operations
   - Program Management
   - Project Management
   - Quality Assurance (separate from QA Engineering?)
   - Technical Writing
   - Developer Relations / DevRel
   - Community Management
   - And any other fintech-specific roles

3. **Propose Category Groups:**
   - Should the 6 current groups be expanded/reorganized?
   - How should new categories map to groups?
   - Are there better group names or structures?

4. **Recommendations:**
   - What's the most pragmatic taxonomy for fintech job tracking?
   - Should we align with a standard (O*NET, Lightcast) or create custom?
   - How to balance granularity vs simplicity?
   - How to handle evolving roles (e.g., AI/ML roles becoming more common)?

5. **Output Format:**
   Provide:
   - Complete list of recommended categories (40-60 total)
   - Recommended category groups (6-8 groups)
   - Mapping of categories to groups
   - Rationale for each addition/modification
   - Notes on edge cases (e.g., Product Engineer, Marketing Engineer)
```

---

## 3. Missing Categories Identified

### High Priority (Common in Fintech):

1. **communications** - Communications / PR
2. **ux-design** - UX Design (distinct from product-design)
3. **product-operations** - Product Operations
4. **compliance** - Compliance (general, vs legal-compliance)
5. **aml** - AML / KYC
6. **regulatory-affairs** - Regulatory Affairs
7. **business-development** - Business Development
8. **partnerships** - Partnerships
9. **revenue-operations** - Revenue Operations / RevOps
10. **sre** - Site Reliability Engineering (vs DevOps)
11. **data-science** - Data Science (vs data-analytics)
12. **developer-relations** - Developer Relations / DevRel

### Medium Priority:

13. **corporate-development** - Corporate Development / M&A
14. **investor-relations** - Investor Relations
15. **program-management** - Program Management
16. **project-management** - Project Management
17. **security-operations** - Security Operations (vs security engineering)
18. **platform-engineering** - Platform Engineering
19. **business-intelligence** - Business Intelligence
20. **technical-writing** - Technical Writing
21. **audit** - Audit
22. **community-management** - Community Management
23. **quality-assurance** - Quality Assurance (non-engineering)

**Total: 27 existing + 23 new = 50 categories**

---

## 4. Pragmatic Management Options

### Option 1: Expand Current Taxonomy (Recommended for Now)

**Pros:**
- ✅ Minimal code changes
- ✅ Maintains existing structure
- ✅ Easy to implement quickly
- ✅ No database schema changes needed (just CHECK constraint update)

**Cons:**
- ⚠️ Still requires manual code updates
- ⚠️ Categories hard-coded in multiple places

**Implementation Steps:**
1. Add missing categories to `ROLE_CATEGORIES` array
2. Update `CATEGORY_GROUPS` mapping
3. Add labels to `getCategoryLabel()`
4. Create migration to update database CHECK constraint
5. Update Zod schema
6. Backfill existing jobs if needed

**Best For:** Short-term (next 3-6 months)

---

### Option 2: Hybrid Approach (Future-Proof)

**Pros:**
- ✅ More flexible
- ✅ Can add categories without code changes
- ✅ Better for long-term maintenance
- ✅ Can version categories

**Cons:**
- ⚠️ More complex implementation
- ⚠️ Requires database schema changes
- ⚠️ More code to maintain

**Implementation:**
1. Create `job_categories` table:
   ```sql
   CREATE TABLE job_categories (
     id UUID PRIMARY KEY,
     code TEXT UNIQUE NOT NULL,
     label TEXT NOT NULL,
     group_name TEXT NOT NULL,
     description TEXT,
     is_active BOOLEAN DEFAULT true,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```
2. Cache categories in application code
3. Admin UI to manage categories
4. Version categories for historical tracking

**Best For:** Medium-term (6+ months)

---

### Option 3: Align with Standard Taxonomy

**Pros:**
- ✅ Industry standard
- ✅ Well-documented
- ✅ Future-proof
- ✅ Can leverage existing tools

**Cons:**
- ⚠️ May not fit fintech perfectly
- ⚠️ Requires mapping layer
- ⚠️ More complex
- ⚠️ May be overkill

**Implementation:**
1. Map to O*NET or Lightcast taxonomy
2. Create mapping layer
3. Store standard codes + custom labels
4. Maintain mapping table

**Best For:** Long-term (if we need industry alignment)

---

## 5. Recommended Next Steps

### Immediate (This Week):
1. ✅ **DONE:** Restore "other" category for uncategorized jobs
2. **Run LLM research** using the prompt above
3. **Review missing categories** and prioritize additions
4. **Decide on management approach** (Option 1 recommended for now)

### Short-Term (Next 2-4 Weeks):
1. **Add high-priority missing categories** (communications, ux-design, product-operations, compliance, aml, etc.)
2. **Update category groups** to accommodate new categories
3. **Create migration** to update database CHECK constraint
4. **Update UI** if needed (colors, labels)
5. **Backfill** existing jobs with new categories if needed

### Medium-Term (Next 3-6 Months):
1. **Monitor category usage** - Track which categories are most common
2. **Log uncategorized jobs** - Track jobs that end up in "other"
3. **Quarterly review** - Review and add new categories quarterly
4. **Document category definitions** - Create clear definitions for each category

### Long-Term (6+ Months):
1. **Consider Option 2** (database-driven categories) if we're adding categories frequently
2. **Build admin UI** for category management
3. **Version categories** for historical tracking
4. **Align with industry standard** if beneficial

---

## 6. Category Group Recommendations

### Current Groups (7 - Updated):
- Engineering (10 categories)
- Product & Design (5 categories)
- Data & Analytics (3 categories)
- Risk, Legal & Compliance (6 categories)
- Go-To-Market (8 categories)
- Finance & Strategy (5 categories)
- Operations & People (8 categories)
- Other (1 category)

**Total: 45 categories**

### Previous Groups (6 - Deprecated):

1. **Engineering** (14 categories)
   - All engineering roles + platform, SRE, security ops, devrel, tech writing

2. **Product** (4 categories)
   - product-management, product-design, product-research, product-operations

3. **Design** (3 categories)
   - ux-design, design-systems, product-design (or merge with Product?)

4. **Marketing** (4 categories)
   - marketing-growth, marketing-product, marketing-content, marketing-brand

5. **Go-to-Market** (5 categories)
   - sales, customer-success, customer-support, business-development, partnerships

6. **Operations** (10 categories)
   - operations, finance, legal-compliance, hr-people, data-analytics, risk, revenue-operations, program-management, project-management, quality-assurance

7. **Compliance & Regulatory** (4 categories)
   - compliance, aml, regulatory-affairs, audit

8. **Data & Analytics** (3 categories)
   - data-analytics, data-science, business-intelligence

9. **Corporate** (3 categories)
   - corporate-development, investor-relations, communications

10. **Leadership** (1 category)
    - leadership

11. **Other** (1 category)
    - other

**Note:** Consider merging Design with Product, or keeping separate. Design could also be part of Engineering (for design systems).

---

## 7. Questions to Answer

Before implementing new categories:

1. **Should Design be separate from Product?**
   - Option A: Keep separate (Design group)
   - Option B: Merge with Product
   - Option C: Split (UX Design → Product, Design Systems → Engineering)

2. **How granular should Engineering be?**
   - Keep platform-engineering separate from DevOps?
   - Keep SRE separate from DevOps?
   - Keep security-operations separate from security-engineering?

3. **How to handle overlapping categories?**
   - Product Engineer → engineering or product?
   - Marketing Engineer → marketing or engineering?
   - Data Engineer → engineering-data or data-analytics?

4. **Should we have subcategories?**
   - e.g., "engineering-backend" vs just "engineering"?
   - Current approach: granular categories, grouped for display

---

## 8. Implementation Checklist

When adding new categories:

- [ ] Add to `ROLE_CATEGORIES` array
- [ ] Add to `CATEGORY_GROUPS` mapping
- [ ] Add label to `getCategoryLabel()`
- [ ] Update Zod schema
- [ ] Create database migration (update CHECK constraint)
- [ ] Update UI colors if needed (`GROUP_COLORS`)
- [ ] Update documentation
- [ ] Test with sample jobs
- [ ] Backfill existing jobs if needed

---

## References

- **Research Document:** `docs/JOB_CATEGORY_TAXONOMY_RESEARCH.md`
- **Current Implementation:** `web/lib/analysis/function-categories.ts`
- **Database Migration:** `web/supabase/migrations/20260127000000_function_category.sql`
- **Extraction Logic:** `web/lib/analysis/structure.ts`
