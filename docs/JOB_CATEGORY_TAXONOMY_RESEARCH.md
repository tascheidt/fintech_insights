# Job Category Taxonomy Research

**Date:** January 27, 2026  
**Purpose:** Research comprehensive job category taxonomies and propose pragmatic management approach

---

## LLM Research Prompt

Use this prompt with Gemini 3 Pro or Claude to research job taxonomies:

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

## Common Taxonomies Found

### O*NET-SOC (Standard Occupational Classification)
- **23 Major Groups** including:
  - Management Occupations (11-0000)
  - Business and Financial Operations (13-0000)
  - Computer and Mathematical Occupations (15-0000)
  - Sales and Related Occupations (41-0000)
- **867 Detailed Occupations**
- Government standard, updated periodically
- **Pros:** Authoritative, comprehensive
- **Cons:** Too broad for fintech-specific roles, slow to update

### Lightcast Occupation Taxonomy (LOT)
- **1,800+ Specialized Occupations**
- **4 Hierarchical Levels:**
  - Career Areas
  - Occupation Groups
  - Occupations
  - Specialized Occupations
- More granular than O*NET
- **Pros:** More detailed, industry-specific
- **Cons:** Proprietary, may require licensing

### ATS Standard Categories
Most ATS platforms use similar high-level categories:
- Engineering
- Product
- Design
- Marketing
- Sales
- Customer Success
- Operations
- Finance
- Legal
- People/HR
- Executive/Leadership

---

## Missing Categories Identified

Based on research and user feedback:

### Communications & PR
- **communications** - Public relations, media relations, corporate communications
- **pr** - Public relations (could be separate or merged with communications)

### Design
- **ux-design** - User experience design (distinct from product design)
- **ui-design** - User interface design
- **design-systems** - Design systems engineering

### Product
- **product-operations** - Product ops, product analytics, product data
- **product-marketing** - Already exists as "marketing-product" - clarify distinction

### Compliance & Regulatory
- **compliance** - General compliance (vs legal-compliance)
- **aml** - Anti-Money Laundering
- **regulatory-affairs** - Regulatory compliance, government relations
- **audit** - Internal audit, risk audit

### Business Development
- **business-development** - Strategic partnerships, business development (vs sales)
- **partnerships** - Partnership management, channel partnerships
- **corporate-development** - M&A, corporate strategy

### Operations
- **revenue-operations** - RevOps, sales operations
- **customer-operations** - Customer operations (vs customer success/support)
- **program-management** - Program management (vs project management)
- **project-management** - Project management

### Engineering Specializations
- **platform-engineering** - Platform engineering (vs DevOps)
- **sre** - Site Reliability Engineering (vs DevOps)
- **security-operations** - Security operations (vs security engineering)
- **developer-relations** - DevRel, developer advocacy
- **technical-writing** - Technical writing, documentation

### Data & Analytics
- **data-science** - Data science (vs data analytics)
- **business-intelligence** - BI, business intelligence
- **data-analytics** - Already exists - clarify vs data science

### Other
- **investor-relations** - IR, investor relations
- **community-management** - Community management
- **quality-assurance** - QA (non-engineering, process QA)

---

## Recommended Pragmatic Approach

### Option 1: Expand Current Taxonomy (Recommended)
**Pros:**
- Minimal code changes
- Maintains existing structure
- Easy to implement

**Cons:**
- Still requires manual updates
- Categories hard-coded in multiple places

**Implementation:**
1. Add missing categories to `ROLE_CATEGORIES`
2. Update `CATEGORY_GROUPS` mapping
3. Update database CHECK constraint
4. Add labels to `getCategoryLabel()`

### Option 2: Hybrid Approach (Future-Proof)
**Pros:**
- More flexible
- Can add categories without code changes
- Better for long-term maintenance

**Cons:**
- More complex implementation
- Requires database schema changes

**Implementation:**
1. Store categories in database table `job_categories`
2. Cache in application code
3. Admin UI to manage categories
4. Version categories for historical tracking

### Option 3: Align with Standard Taxonomy
**Pros:**
- Industry standard
- Well-documented
- Future-proof

**Cons:**
- May not fit fintech perfectly
- Requires mapping layer
- More complex

**Implementation:**
1. Map to O*NET or Lightcast taxonomy
2. Create mapping layer
3. Store standard codes + custom labels

---

## Recommended Category Expansion

### Proposed New Categories (to add to existing 27):

**Communications:**
- `communications` - Communications / PR

**Design:**
- `ux-design` - UX Design
- `design-systems` - Design Systems

**Product:**
- `product-operations` - Product Operations

**Compliance:**
- `compliance` - Compliance
- `aml` - AML / KYC
- `regulatory-affairs` - Regulatory Affairs
- `audit` - Audit

**Business Development:**
- `business-development` - Business Development
- `partnerships` - Partnerships
- `corporate-development` - Corporate Development

**Operations:**
- `revenue-operations` - Revenue Operations
- `program-management` - Program Management
- `project-management` - Project Management

**Engineering:**
- `platform-engineering` - Platform Engineering
- `sre` - Site Reliability Engineering
- `security-operations` - Security Operations
- `developer-relations` - Developer Relations
- `technical-writing` - Technical Writing

**Data:**
- `data-science` - Data Science
- `business-intelligence` - Business Intelligence

**Other:**
- `investor-relations` - Investor Relations
- `community-management` - Community Management
- `quality-assurance` - Quality Assurance

**Total: 27 existing + 23 new = 50 categories**

### Proposed Category Groups (Updated):

1. **Engineering** (14 categories)
   - All engineering roles + platform, SRE, security ops, devrel, tech writing

2. **Product** (4 categories)
   - product-management, product-design, product-research, product-operations

3. **Design** (3 categories)
   - ux-design, design-systems, product-design (shared with Product?)

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

**Total: 11 groups**

---

## Ongoing Management Strategy

### Short-Term (Now):
1. ✅ Restore "other" category for uncategorized jobs
2. ✅ Add missing categories identified above
3. ✅ Update database constraint
4. ✅ Document category definitions

### Medium-Term (Next 3-6 months):
1. Create category management script
2. Add logging for uncategorized jobs
3. Monitor which categories are most common
4. Review quarterly for new categories

### Long-Term (6+ months):
1. Consider database-driven categories
2. Build admin UI for category management
3. Version categories for historical tracking
4. Align with industry standard if beneficial

---

## Next Steps

1. **Review and approve** proposed category additions
2. **Update code** to restore "other" for uncategorized
3. **Add new categories** to codebase
4. **Run migration** to update database constraint
5. **Backfill** existing jobs with new categories if needed
6. **Document** category definitions and usage
