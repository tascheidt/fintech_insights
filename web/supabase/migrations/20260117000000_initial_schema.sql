-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default organization for new users
INSERT INTO organizations (id, name, slug) VALUES (uuid_generate_v4(), 'Default Organization', 'default');

-- Profiles (linked to Supabase auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Companies
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    country TEXT NOT NULL,
    track_for_strategy BOOLEAN DEFAULT FALSE,
    ats_type TEXT NOT NULL,
    ats_identifier TEXT,
    careers_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_collected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id),
    UNIQUE(organization_id, slug)
);

-- Job Postings
CREATE TABLE job_postings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    department TEXT,
    team TEXT,
    location TEXT,
    location_type TEXT,
    description_html TEXT,
    description_text TEXT,
    commitment TEXT,
    posted_date TIMESTAMPTZ,
    first_seen_date TIMESTAMPTZ DEFAULT NOW(),
    last_seen_date TIMESTAMPTZ DEFAULT NOW(),
    closed_date TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    url TEXT,
    UNIQUE(company_id, external_id)
);

-- Strategic Insights
CREATE TABLE strategic_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_posting_id UUID REFERENCES job_postings(id) ON DELETE CASCADE,
    run_date TIMESTAMPTZ DEFAULT NOW(),
    category TEXT,
    insight_summary TEXT,
    strategic_signals JSONB DEFAULT '[]',
    is_new_direction BOOLEAN DEFAULT FALSE,
    confidence TEXT CHECK (confidence IN ('high', 'medium', 'low'))
);

-- Job Templates
CREATE TABLE job_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_posting_id UUID REFERENCES job_postings(id) ON DELETE CASCADE,
    role_category TEXT,
    extracted_sections JSONB DEFAULT '{}',
    quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 5),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Posting Events (track new, closed, updated)
CREATE TABLE posting_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_posting_id UUID REFERENCES job_postings(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_date TIMESTAMPTZ DEFAULT NOW(),
    details TEXT
);

-- Audit Log
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id),
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_companies_org ON companies(organization_id);
CREATE INDEX idx_job_postings_company ON job_postings(company_id);
CREATE INDEX idx_job_postings_first_seen ON job_postings(first_seen_date);
CREATE INDEX idx_job_postings_active ON job_postings(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_strategic_insights_job ON strategic_insights(job_posting_id);
CREATE INDEX idx_strategic_insights_run_date ON strategic_insights(run_date);
CREATE INDEX idx_job_templates_category ON job_templates(role_category);
CREATE INDEX idx_posting_events_job ON posting_events(job_posting_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

-- Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategic_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE posting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- RLS: Organizations
CREATE POLICY "Users can view their organization"
    ON organizations FOR SELECT
    USING (id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- RLS: Profiles
CREATE POLICY "Users can view their profile"
    ON profiles FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- RLS: Companies
CREATE POLICY "Users can view companies in their org"
    ON companies FOR SELECT
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Editors can insert companies"
    ON companies FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM profiles
            WHERE id = auth.uid() AND role IN ('editor', 'admin')
        )
    );

CREATE POLICY "Editors can update companies in their org"
    ON companies FOR UPDATE
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid() AND role IN ('editor', 'admin')))
    WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid() AND role IN ('editor', 'admin')));

CREATE POLICY "Editors can delete companies in their org"
    ON companies FOR DELETE
    USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid() AND role IN ('editor', 'admin')));

-- RLS: Job Postings (SELECT only; INSERT/UPDATE via service role in cron)
CREATE POLICY "Users can view job postings in their org"
    ON job_postings FOR SELECT
    USING (
        company_id IN (
            SELECT id FROM companies
            WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- RLS: Strategic Insights
CREATE POLICY "Users can view insights in their org"
    ON strategic_insights FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM job_postings jp
            INNER JOIN companies c ON c.id = jp.company_id
            WHERE jp.id = strategic_insights.job_posting_id
            AND c.organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- RLS: Job Templates
CREATE POLICY "Users can view templates in their org"
    ON job_templates FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM job_postings jp
            INNER JOIN companies c ON c.id = jp.company_id
            WHERE jp.id = job_templates.job_posting_id
            AND c.organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- RLS: Posting Events
CREATE POLICY "Users can view posting events in their org"
    ON posting_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM job_postings jp
            INNER JOIN companies c ON c.id = jp.company_id
            WHERE jp.id = posting_events.job_posting_id
            AND c.organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- RLS: Audit Log
CREATE POLICY "Admins can view audit log"
    ON audit_log FOR SELECT
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can insert own audit log"
    ON audit_log FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Create trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    default_org_id UUID;
BEGIN
    SELECT id INTO default_org_id FROM organizations WHERE slug = 'default' LIMIT 1;
    INSERT INTO public.profiles (id, email, full_name, organization_id)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        default_org_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
