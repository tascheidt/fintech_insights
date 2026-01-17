# Phase 2 Implementation Guide
## Web Application on Vercel

This document provides the technical implementation plan for deploying the Fintech Intelligence Platform as a web application.

---

## Quick Start Checklist

- [ ] Create Vercel account and project
- [ ] Create Supabase project
- [ ] Initialize Next.js application
- [ ] Configure environment variables
- [ ] Set up authentication
- [ ] Migrate database schema
- [ ] Implement core features
- [ ] Deploy to production

---

## 1. Project Initialization

### Create Next.js Project

```bash
npx create-next-app@latest fintech-intelligence --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd fintech-intelligence
```

### Install Dependencies

```bash
# Core
npm install @supabase/supabase-js @supabase/ssr

# UI Components (shadcn/ui)
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card table tabs input select dialog

# Data fetching
npm install @tanstack/react-query

# Charts
npm install recharts

# AI
npm install @google/generative-ai

# Utilities
npm install date-fns zod
```

---

## 2. Supabase Setup

### Create Project

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Note your project URL and anon key

### Database Migration

```sql
-- Run in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- Indexes
CREATE INDEX idx_companies_org ON companies(organization_id);
CREATE INDEX idx_job_postings_company ON job_postings(company_id);
CREATE INDEX idx_job_postings_active ON job_postings(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_strategic_insights_job ON strategic_insights(job_posting_id);
CREATE INDEX idx_job_templates_category ON job_templates(role_category);

-- Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategic_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their organization"
    ON organizations FOR SELECT
    USING (id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view their profile"
    ON profiles FOR SELECT
    USING (id = auth.uid());

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

-- Similar policies for other tables...
```

### Configure Auth

```sql
-- Create trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## 3. Environment Configuration

### `.env.local`

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Gemini AI
GEMINI_API_KEY=your-gemini-api-key

# Vercel Cron Secret
CRON_SECRET=your-random-secret-string

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 4. Key Components

### Authentication (`lib/supabase/server.ts`)

```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )
}
```

### Dashboard Page (`app/(dashboard)/page.tsx`)

```typescript
import { createClient } from '@/lib/supabase/server'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { RecentInsights } from '@/components/dashboard/recent-insights'
import { HiringChart } from '@/components/dashboard/hiring-chart'

export default async function DashboardPage() {
  const supabase = createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user's organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  // Fetch dashboard data
  const { data: stats } = await supabase.rpc('get_dashboard_stats', {
    org_id: profile.organization_id
  })

  const { data: recentInsights } = await supabase
    .from('strategic_insights')
    .select(`
      *,
      job_posting:job_postings(
        title,
        company:companies(name)
      )
    `)
    .order('run_date', { ascending: false })
    .limit(5)

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <StatsCards stats={stats} />
      <div className="grid gap-8 md:grid-cols-2">
        <RecentInsights insights={recentInsights} />
        <HiringChart />
      </div>
    </div>
  )
}
```

### Add Company Form (`components/companies/add-company-form.tsx`)

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

export function AddCompanyForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)

  async function testConnection(data: FormData) {
    setTesting(true)
    const res = await fetch('/api/companies/test', {
      method: 'POST',
      body: JSON.stringify({
        atsType: data.get('atsType'),
        atsIdentifier: data.get('atsIdentifier'),
      }),
    })
    const result = await res.json()
    setTesting(false)

    if (result.success) {
      alert(`Success! Found ${result.jobCount} jobs.`)
    } else {
      alert(`Error: ${result.error}`)
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const res = await fetch('/api/companies', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(formData)),
    })

    if (res.ok) {
      router.push('/companies')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input name="name" placeholder="Company Name" required />

      <Select name="country" required>
        <option value="CA">Canada</option>
        <option value="UK">United Kingdom</option>
        <option value="US">United States</option>
      </Select>

      <Select name="atsType" required>
        <option value="">Select ATS Platform</option>
        <option value="lever">Lever</option>
        <option value="greenhouse">Greenhouse</option>
        <option value="workable">Workable</option>
        <option value="workday">Workday</option>
      </Select>

      <Input name="atsIdentifier" placeholder="ATS Identifier" required />
      <Input name="careersUrl" placeholder="Careers Page URL" />

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => testConnection(new FormData(e.currentTarget))}>
          {testing ? 'Testing...' : 'Test Connection'}
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Adding...' : 'Add Company'}
        </Button>
      </div>
    </form>
  )
}
```

### Cron Job (`app/api/cron/collect/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { collectJobs } from '@/lib/scrapers'
import { analyzeJob } from '@/lib/analysis'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get all active companies
  const { data: companies } = await supabase
    .from('companies')
    .select('*')
    .eq('is_active', true)

  let totalNew = 0
  let totalClosed = 0

  for (const company of companies || []) {
    try {
      const { newJobs, closedJobs } = await collectJobs(supabase, company)
      totalNew += newJobs.length
      totalClosed += closedJobs.length

      // Analyze new jobs for strategic companies
      if (company.track_for_strategy) {
        for (const job of newJobs) {
          const insight = await analyzeJob(company.name, job)
          if (insight) {
            await supabase.from('strategic_insights').insert({
              job_posting_id: job.id,
              ...insight,
            })
          }
        }
      }
    } catch (error) {
      console.error(`Error collecting from ${company.name}:`, error)
    }
  }

  return NextResponse.json({
    success: true,
    newJobs: totalNew,
    closedJobs: totalClosed,
  })
}
```

---

## 5. Vercel Configuration

### `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/collect",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/cron/report",
      "schedule": "0 8 * * 1"
    }
  ]
}
```

### Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Link to Vercel project
vercel link

# Add environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add GEMINI_API_KEY
vercel env add CRON_SECRET

# Deploy
vercel --prod
```

---

## 6. Data Migration

### Migrate SQLite to PostgreSQL

```python
# scripts/migrate_to_supabase.py
import sqlite3
from supabase import create_client

# Connect to SQLite
sqlite_conn = sqlite3.connect('data/jobs.db')
sqlite_conn.row_factory = sqlite3.Row

# Connect to Supabase
supabase = create_client(
    'https://your-project.supabase.co',
    'your-service-role-key'
)

# Create default organization
org = supabase.table('organizations').insert({
    'name': 'My Company',
    'slug': 'my-company'
}).execute()
org_id = org.data[0]['id']

# Migrate companies
companies = sqlite_conn.execute('SELECT * FROM companies').fetchall()
company_map = {}

for c in companies:
    result = supabase.table('companies').insert({
        'organization_id': org_id,
        'name': c['name'],
        'slug': c['slug'],
        'country': c['country'],
        'track_for_strategy': bool(c['track_for_strategy']),
        'ats_type': c['ats_type'],
        'ats_identifier': c['ats_identifier'],
        'careers_url': c['careers_url'],
    }).execute()
    company_map[c['id']] = result.data[0]['id']

# Migrate job postings
# ... similar pattern for other tables
```

---

## 7. Testing Checklist

### Functionality Tests
- [ ] User can sign up and sign in
- [ ] Dashboard loads with correct data
- [ ] User can add a new company
- [ ] Test connection works for each ATS type
- [ ] Insights display correctly
- [ ] Template search and filtering works
- [ ] Cron jobs execute successfully
- [ ] Email reports are generated and sent

### Security Tests
- [ ] Unauthenticated users cannot access dashboard
- [ ] Users can only see their organization's data
- [ ] RLS policies work correctly
- [ ] API routes are protected
- [ ] Cron routes verify secret

### Performance Tests
- [ ] Dashboard loads in < 2 seconds
- [ ] Search returns results in < 500ms
- [ ] Large job lists paginate correctly

---

## 8. Launch Checklist

- [ ] All environment variables configured in Vercel
- [ ] Database migrations complete
- [ ] Historical data migrated
- [ ] Auth providers configured (Google, Microsoft)
- [ ] Custom domain configured
- [ ] Error monitoring set up (Sentry)
- [ ] Analytics configured
- [ ] Initial users invited
- [ ] Documentation complete

---

*This guide provides the technical foundation for Phase 2. Adjust as needed based on your specific requirements.*
