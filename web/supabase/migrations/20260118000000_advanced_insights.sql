-- Advanced Strategic Insights Migration
-- Adds enhanced analysis fields and conversational follow-up capability

-- Extend strategic_insights table with advanced analysis fields
ALTER TABLE strategic_insights 
  ADD COLUMN IF NOT EXISTS novelty_score INTEGER CHECK (novelty_score BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS novelty_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS is_executive_movement BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS executive_context TEXT,
  ADD COLUMN IF NOT EXISTS strategic_hypothesis TEXT,
  ADD COLUMN IF NOT EXISTS web_context JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS model_reasoning TEXT;

-- New table for conversational follow-ups on insights
CREATE TABLE IF NOT EXISTS insight_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    insight_id UUID REFERENCES strategic_insights(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    messages JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_insight_conversations_insight ON insight_conversations(insight_id);
CREATE INDEX IF NOT EXISTS idx_insight_conversations_user ON insight_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_strategic_insights_novelty ON strategic_insights(novelty_score) WHERE novelty_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_strategic_insights_executive ON strategic_insights(is_executive_movement) WHERE is_executive_movement = TRUE;

-- RLS: Insight Conversations
ALTER TABLE insight_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own conversations"
    ON insight_conversations FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can create conversations"
    ON insight_conversations FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own conversations"
    ON insight_conversations FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_insight_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER insight_conversations_updated_at
    BEFORE UPDATE ON insight_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_insight_conversations_updated_at();
