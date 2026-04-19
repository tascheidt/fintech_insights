-- Phase 5 of the Gemini cost-reduction plan: append-only telemetry for
-- every Gemini API call. Written via writeUsageEvent from
-- web/lib/ai/gemini-telemetry.ts. Used for:
--   - daily spend tracking and regression detection
--   - visibility into the silent Pro->Flash fallback at
--     web/lib/analysis/advanced-strategic.ts (model_requested vs model_served)
--   - per-call-site attribution so we can see which feature drove any cost shift
--
-- Not a substitute for the Google Cloud billing dashboard; `estimated_usd`
-- is computed client-side from the pricing table at
-- web/lib/ai/gemini-pricing.ts and is intended for internal tracking only.

CREATE TABLE IF NOT EXISTS gemini_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Logical call-site label (e.g. "extractJobStructure",
  -- "analyzeJobAdvanced", "performWebSearch", "generateCompanyInsight").
  call_site TEXT NOT NULL,

  -- Model string requested at the SDK call. Typically a -latest alias.
  model_requested TEXT NOT NULL,
  -- Model that actually served the response. Differs when the quota fallback
  -- at advanced-strategic.ts swaps Pro to Flash. Captures what we actually paid for.
  model_served TEXT NOT NULL,

  grounding_enabled BOOLEAN NOT NULL DEFAULT false,

  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,

  -- USD estimate from the client-side pricing table. Not the real invoice.
  estimated_usd NUMERIC(12, 8) NOT NULL DEFAULT 0,

  latency_ms INTEGER NOT NULL DEFAULT 0,

  -- 'ok' | 'error'
  status TEXT NOT NULL DEFAULT 'ok',
  error_message TEXT,

  -- Optional link to the job_run that kicked off this call (useful for the
  -- cron path; null for user chat and on-demand insight calls that live
  -- outside a job_run).
  job_run_id UUID REFERENCES job_runs(id) ON DELETE SET NULL,

  -- Call-site-specific extras (job id, company name, retry count, fallback
  -- reason, etc.). Keep unstructured so new call-sites can add context
  -- without migrations.
  extra JSONB
);

CREATE INDEX IF NOT EXISTS idx_gemini_usage_events_created_at
  ON gemini_usage_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gemini_usage_events_call_site
  ON gemini_usage_events(call_site, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gemini_usage_events_job_run_id
  ON gemini_usage_events(job_run_id)
  WHERE job_run_id IS NOT NULL;

ALTER TABLE gemini_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view gemini usage events"
  ON gemini_usage_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Insert is performed via the service role, which bypasses RLS. This policy
-- exists so RLS is not "undefined" for INSERT and to document intent.
CREATE POLICY "Service role writes gemini usage events"
  ON gemini_usage_events FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE gemini_usage_events IS
  'Append-only Gemini API telemetry. Written via writeUsageEvent from web/lib/ai/gemini-telemetry.ts. See CLAUDE.md "AI call-site hygiene" for conventions.';
