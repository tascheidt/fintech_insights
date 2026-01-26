-- Weekly Digest Redesign Migration
-- Adds new columns for industry trends, strategy signals, and notable movements
-- Part of Phase 1: Database Schema Updates

-- ============================================================================
-- Add new columns to weekly_digests table
-- ============================================================================
ALTER TABLE weekly_digests 
ADD COLUMN IF NOT EXISTS global_summary JSONB,
ADD COLUMN IF NOT EXISTS industry_trends JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS strategy_signals JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS notable_movements JSONB DEFAULT '[]';

-- Add comments for documentation
COMMENT ON COLUMN weekly_digests.global_summary IS 'AI-generated industry-level summary with headline, key_insight, and body';
COMMENT ON COLUMN weekly_digests.industry_trends IS 'Array of trend objects: {trend, explanation, companies[], direction}';
COMMENT ON COLUMN weekly_digests.strategy_signals IS 'Array of strategy alignment signals: {company, alignment, signal, detail, interpretation}';
COMMENT ON COLUMN weekly_digests.notable_movements IS 'Array of notable movements: {type, company, description}';

-- ============================================================================
-- Remove track_for_strategy column from companies table
-- Clean removal for pre-production (no backup needed)
-- ============================================================================
ALTER TABLE companies DROP COLUMN IF EXISTS track_for_strategy;

-- Update any views or functions that might reference track_for_strategy
-- (None found in current schema, but this is a safety measure)
