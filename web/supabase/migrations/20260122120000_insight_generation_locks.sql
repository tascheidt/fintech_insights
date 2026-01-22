-- Insight Generation Locks Migration
-- Prevents race conditions when generating company insights concurrently
-- Uses a simple lock table to prevent duplicate insight generation

-- ============================================================================
-- Create processing locks table
-- ============================================================================

CREATE TABLE IF NOT EXISTS insight_generation_locks (
    company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_by TEXT, -- Optional: identifier for debugging (e.g., cron job ID)
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'), -- Auto-expire after 1 hour
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_insight_locks_expires ON insight_generation_locks(expires_at);

-- ============================================================================
-- Function to clean up expired locks (can be called periodically)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_insight_locks()
RETURNS void AS $$
BEGIN
    DELETE FROM insight_generation_locks 
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE insight_generation_locks ENABLE ROW LEVEL SECURITY;

-- Service role can manage locks
CREATE POLICY "Service role can manage insight locks"
    ON insight_generation_locks
    FOR ALL
    USING (true)
    WITH CHECK (true);
