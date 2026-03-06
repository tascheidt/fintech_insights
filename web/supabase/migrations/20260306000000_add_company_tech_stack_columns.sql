-- Add tech stack columns to companies table for caching AI-extracted tech stack analysis
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS tech_stack JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tech_stack_generated_at TIMESTAMPTZ DEFAULT NULL;
