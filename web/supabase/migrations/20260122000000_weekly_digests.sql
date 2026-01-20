-- Weekly Digests Storage Migration
-- Stores generated weekly digests with TLDR-style content for web UI display
-- This allows the dashboard to show digest headlines and summaries

-- ============================================================================
-- Main weekly_digests table
-- Stores one row per weekly digest generation
-- ============================================================================
CREATE TABLE weekly_digests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Time period covered by this digest
    week_start TIMESTAMPTZ NOT NULL,
    week_end TIMESTAMPTZ NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Aggregate stats
    total_jobs INTEGER NOT NULL DEFAULT 0,
    total_companies INTEGER NOT NULL DEFAULT 0,
    
    -- Email delivery tracking
    email_sent BOOLEAN DEFAULT FALSE,
    email_recipient TEXT,
    email_sent_at TIMESTAMPTZ,
    
    -- Prevent duplicate digests for same week
    UNIQUE(week_start, week_end)
);

-- ============================================================================
-- Junction table for company summaries within each digest
-- Stores the TLDR-style headlines and commentary per company
-- ============================================================================
CREATE TABLE weekly_digest_companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    digest_id UUID REFERENCES weekly_digests(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    
    -- TLDR-style content (the star of the show!)
    headline TEXT NOT NULL,  -- e.g., "🚀 Koho bets big on small businesses!"
    body TEXT NOT NULL,      -- 2-3 punchy sentences explaining the move
    
    -- Summary stats for this company in this digest
    new_job_count INTEGER NOT NULL DEFAULT 0,
    departments JSONB DEFAULT '{}',           -- {department: count}
    dominant_tech JSONB DEFAULT '[]',         -- top 3 tech keywords
    seniority_breakdown JSONB DEFAULT '{}',   -- {level: count}
    
    -- Jobs included (optional, for drill-down)
    job_ids JSONB DEFAULT '[]',  -- Array of job posting UUIDs
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicate entries for same company in same digest
    UNIQUE(digest_id, company_id)
);

-- ============================================================================
-- Indexes for performance
-- ============================================================================
CREATE INDEX idx_weekly_digests_generated ON weekly_digests(generated_at DESC);
CREATE INDEX idx_weekly_digests_week ON weekly_digests(week_start, week_end);
CREATE INDEX idx_weekly_digest_companies_digest ON weekly_digest_companies(digest_id);
CREATE INDEX idx_weekly_digest_companies_company ON weekly_digest_companies(company_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE weekly_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_digest_companies ENABLE ROW LEVEL SECURITY;

-- Users can view digests if they belong to an organization with active companies
CREATE POLICY "Users can view weekly digests"
    ON weekly_digests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND organization_id IS NOT NULL
        )
    );

-- Users can view digest company summaries
CREATE POLICY "Users can view weekly digest companies"
    ON weekly_digest_companies FOR SELECT
    USING (
        digest_id IN (SELECT id FROM weekly_digests)
        AND company_id IN (
            SELECT id FROM companies
            WHERE organization_id IN (
                SELECT organization_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- Service role can insert/update (for cron jobs)
-- Note: Service role bypasses RLS, so no explicit policy needed for inserts
