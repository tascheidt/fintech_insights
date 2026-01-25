-- Function Category Migration
-- Adds function_category column to job_postings table for consistent role categorization
-- Uses AI-extracted function category (role specialization) stored alongside standardized_department

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

-- Add comment explaining the field
COMMENT ON COLUMN job_postings.function_category IS 
'Function category (role specialization) extracted from job title and description using AI. Maps to ROLE_CATEGORIES enum. Represents what the person does (e.g., "engineering-backend") vs standardized_department which represents organizational unit (e.g., "Engineering").';
