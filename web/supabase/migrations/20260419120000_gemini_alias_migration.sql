-- Swap pinned `gemini-3-flash-preview` references in runtime settings to the
-- floating `gemini-flash-latest` alias. Historical rows in `prompt_lab_runs`
-- and the original seed migrations are intentionally left untouched — those
-- are snapshots of what ran at the time.
--
-- The `AI_MODEL_OPTIONS` enum in `web/lib/ai/prompt-config.ts` now validates
-- runtime configs against `gemini-flash-latest`; any `system_settings` row
-- still carrying the old value would fail validation until this runs.

UPDATE system_settings
SET setting_value = jsonb_set(
  setting_value,
  '{model}',
  '"gemini-flash-latest"'::jsonb,
  false
)
WHERE setting_value->>'model' = 'gemini-3-flash-preview';
