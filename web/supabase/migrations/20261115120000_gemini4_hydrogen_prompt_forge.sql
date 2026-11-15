-- Gemini 4 eval (Nov 2026, docs/MODEL_EVALS.md decision record): the
-- tech-stack and weekly-digest surfaces move from `gemini-flash-latest` to
-- `gemini-4-hydrogen`. Both are Prompt Forge stages, so a stored
-- `system_settings` row wins over the code default in `SURFACE_MODELS` —
-- without this, the code change would be a no-op for any installation that
-- has saved a config.
--
-- Only rows still on the previous default are moved. A row an admin pointed
-- at another model (Pro, Flash-Lite) is a deliberate choice and is left alone;
-- prompts and every other field are untouched.
--
-- ORDER: apply AFTER the deploy that adds `gemini-4-hydrogen` to
-- `AI_MODEL_OPTIONS`. Older code fails Zod validation on this value and falls
-- back to the code default for the whole row, ignoring the tuned prompts.
-- Rollback: the same UPDATE with the two model ids swapped.

UPDATE system_settings
SET setting_value = jsonb_set(
  setting_value,
  '{model}',
  '"gemini-4-hydrogen"'::jsonb,
  false
)
WHERE setting_key IN ('tech_stack_ai', 'weekly_digest_ai')
  AND setting_value->>'model' = 'gemini-flash-latest';
