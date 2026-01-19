-- System Settings and Cron Logging Migration
-- Adds configurable system settings and job execution tracking

-- System settings table for app configuration
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key TEXT UNIQUE NOT NULL,
    setting_value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES profiles(id)
);

-- Cron job execution logs
CREATE TABLE IF NOT EXISTS cron_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type TEXT NOT NULL CHECK (job_type IN ('collect', 'report')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error')),
    new_jobs_count INTEGER DEFAULT 0,
    closed_jobs_count INTEGER DEFAULT 0,
    insights_generated INTEGER DEFAULT 0,
    companies_processed INTEGER DEFAULT 0,
    error_message TEXT,
    details JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cron_logs_job_type ON cron_logs(job_type);
CREATE INDEX IF NOT EXISTS idx_cron_logs_started_at ON cron_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_logs_status ON cron_logs(status);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);

-- RLS policies
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view and modify system settings
CREATE POLICY "Admins can view system settings"
    ON system_settings FOR SELECT
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update system settings"
    ON system_settings FOR UPDATE
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert system settings"
    ON system_settings FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Admins can view cron logs
CREATE POLICY "Admins can view cron logs"
    ON cron_logs FOR SELECT
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Insert default settings
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
    ('job_collection', '{"frequency": "daily", "time": "06:00", "timezone": "UTC", "enabled": true}', 'Job collection cron schedule'),
    ('weekly_report', '{"frequency": "weekly", "day": "monday", "time": "08:00", "timezone": "UTC", "enabled": true}', 'Weekly report email schedule'),
    ('analysis_settings', '{"auto_analyze": true, "min_confidence": "medium", "max_insights_per_run": 100}', 'Strategic analysis configuration'),
    ('notification_settings', '{"email_enabled": true, "slack_enabled": false, "slack_webhook": null}', 'Notification preferences')
ON CONFLICT (setting_key) DO NOTHING;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_system_settings_updated_at();
