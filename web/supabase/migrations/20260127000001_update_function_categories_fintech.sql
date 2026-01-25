-- Update Function Categories to Fintech-Specific Taxonomy
-- Replaces 27 generic categories with 45 fintech-specific categories
-- Date: January 27, 2026
--
-- IMPORTANT: This migration handles existing data by:
-- 1. Temporarily setting invalid categories to "other"
-- 2. Dropping old constraint
-- 3. Adding new constraint
-- 4. Then run migrate-function-categories.ts to map old → new categories

-- Step 1: Map old categories to new categories (for categories that exist in both)
-- Categories that map directly (no change needed):
-- engineering-backend, engineering-frontend, engineering-fullstack, engineering-mobile,
-- engineering-data, engineering-security, engineering-qa, product-management, product-research

-- Step 2: Drop the old CHECK constraint FIRST
-- This allows us to update rows without constraint violations
ALTER TABLE job_postings 
DROP CONSTRAINT IF EXISTS job_postings_function_category_check;

-- Step 3: Temporarily set categories that don't exist in new taxonomy to "other"
-- Now we can update without constraint violations
UPDATE job_postings
SET function_category = 'other'
WHERE function_category IS NOT NULL
  AND function_category NOT IN (
    -- Categories that exist in both old and new taxonomy (keep as-is)
    'engineering-backend',
    'engineering-frontend',
    'engineering-fullstack',
    'engineering-mobile',
    'engineering-data',
    'engineering-security',
    'engineering-qa',
    'product-management',
    'product-research',
    'customer-support',
    'other'
  );

-- Step 4: Add new CHECK constraint with 45 fintech-specific categories
-- All existing rows are now valid (either kept as-is or set to "other")
ALTER TABLE job_postings 
ADD CONSTRAINT job_postings_function_category_check CHECK (
  function_category IN (
    -- Group 1: Engineering (10 categories)
    'engineering-backend',
    'engineering-frontend',
    'engineering-fullstack',
    'engineering-mobile',
    'engineering-data',
    'engineering-ai-ml',
    'engineering-platform-sre-devops',
    'engineering-security',
    'engineering-qa',
    'engineering-management',
    -- Group 2: Product & Design (5 categories)
    'product-management',
    'product-design-ux',
    'product-research',
    'technical-program-management',
    'technical-writing',
    -- Group 3: Data & Analytics (3 categories)
    'data-science',
    'data-analytics-bi',
    'analytics-engineering',
    -- Group 4: Risk, Legal & Compliance (6 categories)
    'compliance',
    'aml-financial-crime',
    'fraud-trust-safety',
    'legal',
    'regulatory-affairs',
    'risk-management',
    -- Group 5: Go-To-Market (8 categories)
    'sales-account-executives',
    'account-management-customer-success',
    'customer-support',
    'business-development-partnerships',
    'solutions-engineering',
    'revenue-operations',
    'marketing-growth-performance',
    'marketing-product-brand',
    'developer-relations',
    -- Group 6: Finance & Strategy (5 categories)
    'finance-accounting',
    'strategic-finance-fpa',
    'capital-markets-treasury',
    'corporate-development-strategy',
    'investor-relations',
    -- Group 7: Operations & People (8 categories)
    'customer-support-cx',
    'customer-operations',
    'people-ops-hr',
    'talent-acquisition-recruiting',
    'it-internal-systems',
    'business-operations',
    'executive-leadership',
    'administrative',
    -- Other
    'other'
  )
);

-- Step 5: Update comment to reflect new taxonomy
COMMENT ON COLUMN job_postings.function_category IS 
'Function category (role specialization) extracted from job title and description using AI. Maps to ROLE_CATEGORIES enum (45 fintech-specific categories across 7 groups). Represents what the person does (e.g., "engineering-backend") vs standardized_department which represents organizational unit (e.g., "Engineering").';

-- Note: After running this migration, run migrate-function-categories.ts to map old categories to new ones
