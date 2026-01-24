-- Multi-User Email Digest Migration
-- Adds email preferences to profiles and delivery tracking for weekly digests
-- Enables sending weekly digest emails to all users instead of single recipient

-- ============================================================================
-- Step 1: Add Email Preferences to Profiles Table
-- ============================================================================

-- Add email_preferences JSONB column to profiles table
-- Default: weekly_digest enabled (opt-out model)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS email_preferences JSONB DEFAULT '{"weekly_digest": true}'::jsonb;

-- Add column comment explaining schema
COMMENT ON COLUMN profiles.email_preferences IS 
'User email notification preferences stored as JSONB. Current keys: weekly_digest (boolean). Example: {"weekly_digest": true}';

-- Backfill existing users with default preferences (if column was just added)
UPDATE profiles
SET email_preferences = '{"weekly_digest": true}'::jsonb
WHERE email_preferences IS NULL;

-- ============================================================================
-- Step 2: Create Weekly Digest Deliveries Table
-- ============================================================================

-- Table to track which users received each weekly digest email
-- Enables delivery monitoring, retry logic, and analytics
CREATE TABLE IF NOT EXISTS weekly_digest_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Foreign keys
    digest_id UUID NOT NULL REFERENCES weekly_digests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Email address snapshot (captured at send time)
    email TEXT NOT NULL,
    
    -- Delivery status
    status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
    
    -- Timestamps
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Error details (if delivery failed)
    error_message TEXT,
    
    -- Prevent duplicate entries for same user/digest combination
    UNIQUE(digest_id, user_id)
);

-- Add table comment
COMMENT ON TABLE weekly_digest_deliveries IS 
'Tracks email delivery status for weekly digest emails sent to users. Each row represents one user receiving one digest.';

-- Add column comments
COMMENT ON COLUMN weekly_digest_deliveries.email IS 
'Snapshot of user email address at time of send (in case user changes email later)';
COMMENT ON COLUMN weekly_digest_deliveries.status IS 
'Delivery status: "sent" for successful delivery, "failed" for delivery failure';
COMMENT ON COLUMN weekly_digest_deliveries.error_message IS 
'Error message from email service provider if delivery failed';

-- ============================================================================
-- Step 3: Add Indexes for Performance
-- ============================================================================

-- Index for looking up all deliveries for a specific digest
CREATE INDEX IF NOT EXISTS idx_weekly_digest_deliveries_digest 
ON weekly_digest_deliveries(digest_id);

-- Index for looking up delivery history for a specific user
CREATE INDEX IF NOT EXISTS idx_weekly_digest_deliveries_user 
ON weekly_digest_deliveries(user_id);

-- Index for filtering failed deliveries (useful for retry logic)
CREATE INDEX IF NOT EXISTS idx_weekly_digest_deliveries_status 
ON weekly_digest_deliveries(status) WHERE status = 'failed';

-- Index for querying recent deliveries
CREATE INDEX IF NOT EXISTS idx_weekly_digest_deliveries_sent_at 
ON weekly_digest_deliveries(sent_at DESC);

-- ============================================================================
-- Step 4: Row Level Security Policies
-- ============================================================================

-- Enable RLS on deliveries table
ALTER TABLE weekly_digest_deliveries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own delivery records
-- Allows users to see which digests they received and when
CREATE POLICY "Users can view their own delivery records"
    ON weekly_digest_deliveries FOR SELECT
    USING (user_id = auth.uid());

-- Note: Service role (used by cron jobs) bypasses RLS automatically
-- No explicit INSERT policy needed - service role can insert delivery records
