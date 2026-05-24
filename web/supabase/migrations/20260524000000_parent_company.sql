-- Parent/child company relationship for shared-ATS sub-brands.
--
-- Some sub-brands (e.g. Simplii Financial) post all their roles on the
-- parent's ATS (CIBC's Workday) rather than running their own careers
-- portal. We still want them visible as distinct fintech cards on the
-- dashboard, with their own insight + tech-stack and a clean denominator.
--
-- Mechanism: add `parent_company_id` (nullable FK to companies). The
-- collect cron skips any row where this is set — those companies don't
-- have their own scrape; their jobs land via the parent's scrape with
-- a `companySlugOverride` set by the parent's scraper-side classifier
-- (see `workday-cibc.ts` for Simplii). The processor buckets jobs by
-- override slug and writes each bucket under its own company_id.
--
-- This is the same architectural slot Tangerine uses, except Tangerine
-- has its own brand-path on Scotia's SuccessFactors, so it scrapes
-- itself and `parent_company_id` is null. Use this column only for
-- sub-brands that piggy-back on the parent's listing endpoint.

ALTER TABLE companies
  ADD COLUMN parent_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX idx_companies_parent_company_id
  ON companies(parent_company_id)
  WHERE parent_company_id IS NOT NULL;

COMMENT ON COLUMN companies.parent_company_id IS
  'When set, this company piggy-backs on the parent''s scrape (no own listing endpoint). The collect cron filters parent_company_id IS NULL; jobs land via the parent scraper with companySlugOverride routing in the processor.';

-- Seed the Simplii Financial row as a CIBC sub-brand. Idempotent — if a
-- prior session already inserted the row we just attach the parent FK.
INSERT INTO companies (
  name, slug, country, ats_type, ats_identifier, careers_url,
  tier, is_active, organization_id, parent_company_id
)
SELECT
  'Simplii Financial',
  'simplii',
  'CA',
  'workday-cibc',
  'cibc',
  'https://www.simplii.com',
  'fintech',
  true,
  c.organization_id,
  c.id
FROM companies c
WHERE c.slug = 'cibc'
  AND NOT EXISTS (SELECT 1 FROM companies WHERE slug = 'simplii');

UPDATE companies
SET parent_company_id = (SELECT id FROM companies WHERE slug = 'cibc'),
    tier = 'fintech'
WHERE slug = 'simplii' AND parent_company_id IS NULL;
