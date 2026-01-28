-- Company News Cache
-- Caches company news context fetched via Gemini Pro + Google Search
-- to avoid expensive real-time lookups during weekly digest generation.

CREATE TABLE company_news_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  
  -- News context fields (matches CompanyNewsContext interface)
  recent_news JSONB DEFAULT '[]',           -- Array of NewsItem objects
  stated_strategy TEXT,                      -- Company's publicly stated strategy
  funding_news TEXT,                         -- Recent funding/financial news
  product_launches JSONB DEFAULT '[]',       -- Array of product launch strings
  leadership_changes JSONB DEFAULT '[]',     -- Array of NewsItem objects
  
  -- Cache metadata
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One cache entry per company
  UNIQUE(company_id)
);

-- Index for cache expiration queries
CREATE INDEX idx_company_news_cache_expires ON company_news_cache(expires_at);

-- Index for looking up by company
CREATE INDEX idx_company_news_cache_company ON company_news_cache(company_id);

-- RLS policies
ALTER TABLE company_news_cache ENABLE ROW LEVEL SECURITY;

-- Service role can do anything (for cron jobs)
CREATE POLICY "Service role full access on company_news_cache"
  ON company_news_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read (for dashboard display if needed)
CREATE POLICY "Authenticated users can read company_news_cache"
  ON company_news_cache
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE company_news_cache IS 'Caches company news context from Gemini Pro web search to avoid expensive real-time lookups during digest generation';
COMMENT ON COLUMN company_news_cache.recent_news IS 'Array of {headline, sourceUrl?, sourceTitle?} objects';
COMMENT ON COLUMN company_news_cache.leadership_changes IS 'Array of {headline, sourceUrl?, sourceTitle?} objects for executive changes';
COMMENT ON COLUMN company_news_cache.expires_at IS 'Cache entries expire after 7 days and will be refreshed on next access';
