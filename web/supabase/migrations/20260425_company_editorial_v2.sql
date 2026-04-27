-- v2 editorial fields: working thesis, strategic bets, last-change pointer.
-- These are author-curated; the rendering surfaces (CompaniesIndex_v2,
-- DirectionA_v2) fall back to neutral empty states when these are NULL.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS thesis TEXT,
  ADD COLUMN IF NOT EXISTS thesis_sub TEXT,
  ADD COLUMN IF NOT EXISTS interpretation TEXT,
  ADD COLUMN IF NOT EXISTS bets JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS last_change TEXT,
  ADD COLUMN IF NOT EXISTS last_change_at DATE;

COMMENT ON COLUMN companies.thesis IS
  'Editorial 1–2 sentence working thesis on what this company is doing strategically.';
COMMENT ON COLUMN companies.thesis_sub IS
  'Optional sub-line for the thesis (e.g. "Inferred from 6 months of hiring data, public roadmap, and observed product launches").';
COMMENT ON COLUMN companies.interpretation IS
  'Editorial 2–4 sentence interpretation of recent hiring patterns. Author-written, not LLM-generated.';
COMMENT ON COLUMN companies.bets IS
  'Strategic bets array. Shape: [{ id, title, claim, pivot: "new"|"accel"|"cont"|"quiet", confidence: 1..5, evidence: [{ when, text, type: "internal"|"external" }], forward_signal, job_filter: { function?, theme? } }]';
COMMENT ON COLUMN companies.last_change IS
  'Most recent meaningful event ("USD spending account launched", "First SMB credit-risk hire in 18mo"). Surfaced on Companies index row.';
COMMENT ON COLUMN companies.last_change_at IS
  'When `last_change` happened (derived "6d", "3w" labels in UI).';
