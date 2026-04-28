-- RLS: any authenticated user can read cross_company_themes.
--
-- The cross_company_themes table was created with RLS enabled (Supabase
-- default) but no policies, so dashboard-queries.ts reading via the
-- request-scoped (cookie-bound) client got zero rows back. The data is
-- non-sensitive editorial labels for the function-group taxonomy
-- (Engineering, Risk Legal & Compliance, etc.) and is the same for every
-- viewer, so a flat authenticated-read policy is sufficient.
--
-- Writes still flow through the service-role admin client from the cron
-- and the labeler module, which bypasses RLS — no write policy needed.

CREATE POLICY "Authenticated users can read cross_company_themes"
  ON public.cross_company_themes
  FOR SELECT
  TO authenticated
  USING (true);
