-- Location Structured Migration
-- Adds structured location data column to job_postings table
-- Supports location field enrichment with structured JSON storage

-- Add structured location (city, state, country, formatted)
ALTER TABLE job_postings 
  ADD COLUMN IF NOT EXISTS location_structured JSONB;

-- Indexes for querying by country and state
CREATE INDEX IF NOT EXISTS idx_job_postings_location_country 
  ON job_postings((location_structured->>'country'))
  WHERE location_structured IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_postings_location_state 
  ON job_postings((location_structured->>'state'))
  WHERE location_structured IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_postings_location_city 
  ON job_postings((location_structured->>'city'))
  WHERE location_structured IS NOT NULL;

-- Note: The existing `location` TEXT column is kept for backward compatibility
-- It will be populated with the formatted string from location_structured
