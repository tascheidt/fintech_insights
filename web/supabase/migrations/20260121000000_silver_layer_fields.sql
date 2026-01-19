-- Silver Layer Migration
-- Adds structured data columns to job_postings table for standardized job analysis
-- Supports Epic 2: Analysis & Insights - Silver Layer implementation

-- Add standardized department (normalized from raw department field)
ALTER TABLE job_postings 
  ADD COLUMN IF NOT EXISTS standardized_department TEXT;

-- Add seniority level (extracted from title/description)
ALTER TABLE job_postings 
  ADD COLUMN IF NOT EXISTS seniority_level TEXT CHECK (seniority_level IN ('intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'lead', 'executive'));

-- Add salary information
ALTER TABLE job_postings 
  ADD COLUMN IF NOT EXISTS salary_min INTEGER,
  ADD COLUMN IF NOT EXISTS salary_max INTEGER,
  ADD COLUMN IF NOT EXISTS salary_currency TEXT DEFAULT 'USD';

-- Add tech stack (array of technologies/skills extracted from description)
ALTER TABLE job_postings 
  ADD COLUMN IF NOT EXISTS tech_stack JSONB DEFAULT '[]';

-- Add keywords (extracted tags/keywords from description)
ALTER TABLE job_postings 
  ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}';

-- Add AI-generated job summary
ALTER TABLE job_postings 
  ADD COLUMN IF NOT EXISTS summary TEXT;

-- Add normalized title (standardized job title)
ALTER TABLE job_postings 
  ADD COLUMN IF NOT EXISTS normalized_title TEXT;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_job_postings_standardized_dept ON job_postings(standardized_department);
CREATE INDEX IF NOT EXISTS idx_job_postings_seniority ON job_postings(seniority_level);
CREATE INDEX IF NOT EXISTS idx_job_postings_keywords ON job_postings USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_job_postings_tech_stack ON job_postings USING GIN(tech_stack);

-- Note: function_category will be added in a separate migration as it references job_templates table
-- This allows for proper foreign key relationship setup
