-- Company tier classification.
--
-- Adds a `tier` column so big-bank "incumbent" companies (RBC, TD, BMO, CIBC,
-- National, Scotia parent) can live in the same store as fintechs but be
-- excluded from cross-company volume aggregates by default. Aggregators that
-- drive dashboard KPIs, the competitive matrix, weekly digest themes, and
-- cross-company keyword bags filter to tier='fintech' by default.
--
-- Incumbent rows surface only through dedicated tier-aware views (planned:
-- "Incumbent Bets" dashboard rail, "Incumbent Watch" digest block) and on
-- self-scoped surfaces (jobs list filter, per-company drill-down page).
--
-- Default is 'fintech' so all existing rows are correctly classified without
-- a backfill step. Tangerine stays 'fintech' (it's Scotia's direct-bank
-- fintech brand, not the parent). The parent Scotiabank entry — if added
-- later — gets 'incumbent'. CIBC is special-cased because its careers site
-- also serves Simplii Financial postings; the scraper classifies each
-- posting and routes Simplii to a separate 'fintech'-tier companies row.

ALTER TABLE companies
  ADD COLUMN tier TEXT NOT NULL DEFAULT 'fintech'
    CHECK (tier IN ('fintech', 'incumbent'));

CREATE INDEX idx_companies_tier ON companies(tier);

COMMENT ON COLUMN companies.tier IS
  'fintech (default) | incumbent. Cross-company volume aggregators filter to tier=fintech by default; incumbents surface only through dedicated tier-aware views.';
