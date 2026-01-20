-- Company Insights Display Fields Migration
-- Adds fields for dashboard "Strategic Highlights" display:
--   - headline: Punchy 5-8 word strategic headline with emoji
--   - significance_score: 1-10 ranking for how noteworthy the insight is
--   - key_signal: One-liner explaining the strategic signal
--
-- These fields enable the dashboard to show curated, ranked highlights
-- instead of generic "Company is hiring" cards.

-- ============================================================================
-- Add display fields to company_insights
-- ============================================================================

-- Punchy headline for UI display (e.g., "🎯 Koho doubles down on SMB")
ALTER TABLE company_insights 
ADD COLUMN IF NOT EXISTS headline TEXT;

-- Significance score for ranking highlights (1=routine, 10=major strategic shift)
-- Scoring criteria:
--   Executive hires: +3
--   New strategic direction: +3
--   >50% hiring increase: +2
--   New tech/platform bet: +2
--   Routine hiring: baseline 3-4
ALTER TABLE company_insights 
ADD COLUMN IF NOT EXISTS significance_score INTEGER 
CHECK (significance_score IS NULL OR significance_score BETWEEN 1 AND 10);

-- Key signal - one-liner explaining the strategic implication
-- (e.g., "Pivoting from consumer to small business banking")
ALTER TABLE company_insights 
ADD COLUMN IF NOT EXISTS key_signal TEXT;

-- ============================================================================
-- Index for efficient highlights queries
-- ============================================================================

-- Index for fetching top highlights ordered by significance
CREATE INDEX IF NOT EXISTS idx_company_insights_significance 
ON company_insights(significance_score DESC NULLS LAST, generated_at DESC)
WHERE significance_score IS NOT NULL;

-- ============================================================================
-- Comment documentation
-- ============================================================================

COMMENT ON COLUMN company_insights.headline IS 
'Punchy 5-8 word headline with emoji for dashboard display (e.g., "🎯 Koho doubles down on SMB")';

COMMENT ON COLUMN company_insights.significance_score IS 
'1-10 ranking for how noteworthy this insight is. Used to select top highlights for dashboard. Criteria: exec hires (+3), new direction (+3), hiring surge (+2), tech bet (+2)';

COMMENT ON COLUMN company_insights.key_signal IS 
'One-liner explaining the strategic signal (e.g., "Pivoting from consumer to small business banking")';
