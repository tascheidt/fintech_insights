-- Prompt Forge runtime settings and replay history

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES
  (
    'job_structure_ai',
    '{
      "stage": "job-structure",
      "model": "gemini-3-flash-preview",
      "promptTemplate": "",
      "temperature": 0.2,
      "maxOutputTokens": 64000,
      "version": "seeded-placeholder"
    }'::jsonb,
    'Active AI runtime configuration for per-job structure extraction'
  ),
  (
    'tech_stack_ai',
    '{
      "stage": "tech-stack",
      "model": "gemini-pro-latest",
      "promptTemplate": "",
      "temperature": 0.25,
      "maxOutputTokens": 4096,
      "version": "seeded-placeholder"
    }'::jsonb,
    'Active AI runtime configuration for company tech stack synthesis'
  )
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS prompt_lab_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stage TEXT NOT NULL CHECK (stage IN ('job-structure', 'tech-stack')),
  arena TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  model TEXT NOT NULL,
  candidate_config JSONB NOT NULL,
  baseline_config JSONB NOT NULL,
  candidate_output JSONB NOT NULL,
  baseline_output JSONB NOT NULL,
  metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  score INTEGER NOT NULL DEFAULT 0,
  saved_as_active BOOLEAN NOT NULL DEFAULT FALSE,
  saved_at TIMESTAMPTZ,
  promotion_issue_number INTEGER,
  promotion_issue_url TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_lab_runs_created_at
  ON prompt_lab_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prompt_lab_runs_stage
  ON prompt_lab_runs(stage, created_at DESC);

ALTER TABLE prompt_lab_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view prompt lab runs"
  ON prompt_lab_runs FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert prompt lab runs"
  ON prompt_lab_runs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update prompt lab runs"
  ON prompt_lab_runs FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
