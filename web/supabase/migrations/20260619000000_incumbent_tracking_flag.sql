-- Incumbent (big-bank) tracking feature flag.
--
-- Default OFF: scraping + AI processing + UI for tier='incumbent' companies
-- (RBC, BMO, TD, CIBC, National Bank, Scotiabank) are suppressed until an admin
-- flips this on from the Admin > Settings tab. All incumbent code and already-
-- scraped data are preserved; this flag only gates them, so re-enabling restores
-- everything instantly.
--
-- This is the SINGLE source of truth for the feature. It must never be conflated
-- with companies.is_active — those two axes are kept independent (see CLAUDE.md §7).
-- The reader (web/lib/settings/incumbent-tracking.ts) defaults to false when this
-- row is absent, so the OFF state already holds between code deploy and the
-- manual application of this migration.
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
    ('incumbent_tracking_enabled', '{"enabled": false}', 'Master switch for tier=incumbent scraping, AI processing, and UI surfaces')
ON CONFLICT (setting_key) DO NOTHING;
