-- Company-Level Strategic Insights Migration
-- Adds company-level analysis with deep research, function categorization, and RLS

-- Company Insights table
CREATE TABLE company_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    analysis_period_start TIMESTAMPTZ NOT NULL,
    analysis_period_end TIMESTAMPTZ NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Core Analysis
    executive_summary TEXT NOT NULL,
    strategic_hypothesis TEXT NOT NULL,
    confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
    
    -- Function Analysis
    core_functions JSONB DEFAULT '[]', -- Array of {function: string, job_count: number, trend: string, percentage: number}
    function_changes JSONB DEFAULT '[]', -- Changes vs previous period
    
    -- Hiring Trends
    hiring_trends JSONB DEFAULT '{}', -- Department/function trends over period
    new_directions JSONB DEFAULT '[]', -- New strategic directions detected
    
    -- External Research
    is_public_company BOOLEAN DEFAULT FALSE,
    stated_strategy TEXT, -- Extracted from public sources
    financial_context JSONB DEFAULT '{}', -- Financial report findings
    analyst_reports JSONB DEFAULT '[]', -- Analyst report summaries
    research_sources JSONB DEFAULT '[]', -- URLs and sources used with verification flags
    research_quality_score INTEGER CHECK (research_quality_score BETWEEN 1 AND 5), -- 1=minimal, 5=comprehensive
    
    -- Comparison Analysis
    alignment_analysis TEXT, -- How hiring aligns with stated strategy
    discrepancies JSONB DEFAULT '[]', -- Where hiring diverges from strategy
    strategic_implications TEXT,
    
    -- Metadata
    model_reasoning TEXT,
    research_depth TEXT DEFAULT 'deep' CHECK (research_depth IN ('basic', 'deep')),
    previous_insight_id UUID REFERENCES company_insights(id), -- Link to previous period for comparison
    generation_cost_estimate DECIMAL(10, 4), -- Estimated API cost in USD
    
    -- Prevent duplicate insights for same period
    UNIQUE(company_id, analysis_period_start, analysis_period_end)
);

-- Conversational follow-up on company insights (mirrors insight_conversations pattern)
CREATE TABLE company_insight_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_insight_id UUID REFERENCES company_insights(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    messages JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_company_insights_company ON company_insights(company_id);
CREATE INDEX idx_company_insights_generated ON company_insights(generated_at);
CREATE INDEX idx_company_insights_period ON company_insights(analysis_period_start, analysis_period_end);
CREATE INDEX idx_company_insight_conversations_insight ON company_insight_conversations(company_insight_id);
CREATE INDEX idx_company_insight_conversations_user ON company_insight_conversations(user_id);

-- RLS: Company Insights
ALTER TABLE company_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view company insights in their org"
    ON company_insights FOR SELECT
    USING (
        company_id IN (
            SELECT id FROM companies
            WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- RLS: Company Insight Conversations
ALTER TABLE company_insight_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own company insight conversations"
    ON company_insight_conversations FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can create company insight conversations"
    ON company_insight_conversations FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own company insight conversations"
    ON company_insight_conversations FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Trigger for updated_at (reuses existing function from advanced_insights migration)
CREATE TRIGGER company_insight_conversations_updated_at
    BEFORE UPDATE ON company_insight_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_insight_conversations_updated_at();
