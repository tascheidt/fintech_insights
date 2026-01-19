# Product Requirements Document
## Fintech Competitive Intelligence Platform

**Version:** 1.0
**Date:** January 17, 2026
**Author:** Product Team
**Status:** Phase 1 Complete, Phase 2 Planning

---

## Executive Summary

The Fintech Competitive Intelligence Platform is a strategic tool designed to track, analyze, and report on job postings from Canadian and international fintech competitors. By monitoring hiring patterns, the platform provides actionable insights into competitor strategies, market expansion signals, and technology investments.

The platform serves two primary objectives:
1. **Strategic Intelligence**: Understand competitor strategies through their hiring patterns
2. **Job Template Repository**: Build a structured library of job descriptions for internal recruitment use

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Overview](#solution-overview)
3. [Phase 1: Core Platform (Complete)](#phase-1-core-platform-complete)
4. [Phase 2: Web Application (Planned)](#phase-2-web-application-planned)
5. [Phase 3: Advanced Features (Future)](#phase-3-advanced-features-future)
6. [Technical Architecture](#technical-architecture)
7. [Success Metrics](#success-metrics)
8. [Appendix](#appendix)

---

## Problem Statement

### Business Context

In the competitive Canadian fintech landscape, understanding competitor strategies is crucial for:
- Identifying market expansion opportunities before competitors
- Anticipating product launches and technology shifts
- Benchmarking organizational structure and team composition
- Recruiting talent with competitive job descriptions

### Current Challenges

1. **Manual Monitoring**: Checking competitor career pages is time-consuming and inconsistent
2. **No Historical Data**: Point-in-time observations miss trends and patterns
3. **Scattered Information**: Job posting data isn't centralized or structured
4. **Reactive Strategy**: Learning about competitor moves after they've happened

### Target Users

| User Type | Primary Need |
|-----------|--------------|
| Strategy/Corporate Development | Competitive intelligence on market moves |
| HR/Talent Acquisition | Job description templates and benchmarking |
| Product Leadership | Signals on competitor product investments |
| Executive Team | High-level strategic insights and trends |

---

## Solution Overview

### Product Vision

A comprehensive competitive intelligence platform that automatically tracks competitor hiring activity, applies AI-powered strategic analysis, and delivers actionable insights through a modern web interface.

### Key Capabilities

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Fintech Intelligence Platform                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────┐ │
│  │   Collect   │───▶│   Analyze   │───▶│    Store    │───▶│  Present │ │
│  │  (Scrapers) │    │  (Gemini)   │    │  (Database) │    │   (Web)  │ │
│  └─────────────┘    └─────────────┘    └─────────────┘    └──────────┘ │
│        │                  │                  │                  │       │
│        ▼                  ▼                  ▼                  ▼       │
│   • Lever API        • Strategic       • PostgreSQL       • Dashboard  │
│   • Greenhouse API     Categories      • Job History      • Reports    │
│   • Workable API     • Trend           • Insights         • Alerts     │
│   • Custom Scrapers    Detection       • Templates        • Search     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Core Platform (Complete)

### Delivered Capabilities

#### 1.1 Data Collection Engine

**Status:** ✅ Complete

| Feature | Description | Status |
|---------|-------------|--------|
| Lever Scraper | API integration for Lever-based companies | ✅ Working |
| Greenhouse Scraper | API integration for Greenhouse-based companies | ✅ Working |
| Workable Scraper | API integration for Workable-based companies | ✅ Working |
| Workday Scraper | Custom scraper for Workday-based companies | ⚠️ Partial |
| Change Detection | Track new, updated, and closed postings | ✅ Working |

**Companies Currently Tracked:**

| Company | Country | Strategic | ATS | Status |
|---------|---------|-----------|-----|--------|
| Wealthsimple | Canada | Yes | Lever | ✅ Active (40 jobs) |
| Questrade | Canada | Yes | Workday | ✅ Active (4 jobs) |
| Tangerine | Canada | Yes | Workday | ⚠️ Pending |
| Monzo | UK | No | Greenhouse | ✅ Active (51 jobs) |
| Starling Bank | UK | No | Workable | ✅ Active (10 jobs) |
| Koho | Canada | Yes | TBD | ⚠️ Needs Investigation |
| Neo Financial | Canada | Yes | TBD | ⚠️ Needs Investigation |
| Revolut | UK | No | TBD | ⚠️ Needs Investigation |

#### 1.2 Strategic Analysis Engine

**Status:** ✅ Complete

- **AI Provider**: Google Gemini (Gemini 3 Flash / Pro)
- **Analysis Categories**:
  - `expansion` - Geographic/market expansion signals
  - `new-product` - Product development indicators
  - `technology` - Tech stack changes
  - `operational` - Scaling operations
  - `compliance` - Regulatory focus
  - `customer` - CX investments
  - `data` - Analytics capabilities
  - `marketing` - GTM activities
  - `leadership` - Executive hires

**Output per Job Posting:**
- Strategic category classification
- Insight summary (2-3 sentences)
- Strategic signals (bullet points)
- New direction flag (boolean)
- Confidence score (high/medium/low)

#### 1.3 Data Storage

**Status:** ✅ Complete

- **Database**: SQLite (local development)
- **Schema**: 5 tables (companies, job_postings, strategic_insights, posting_events, job_templates)
- **Retention**: Longitudinal - all historical data preserved

#### 1.4 Reporting System

**Status:** ✅ Complete

- HTML email reports with professional styling
- Weekly strategic intelligence digest
- CSV export functionality
- Preview mode for testing

#### 1.5 Automation

**Status:** ✅ Complete

- CLI interface with multiple commands
- Cron-based scheduling (daily collection, weekly reports)
- Logging and error handling

### Phase 1 Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Companies tracked | 8 | 5 active, 3 pending |
| Job postings collected | 100+ | 105 |
| Analysis accuracy | N/A | Qualitative review pending |
| System uptime | N/A | Manual runs only |

---

## Phase 2: Web Application (Planned)

### Overview

Transform the CLI-based tool into a full web application with user authentication, interactive dashboards, and self-service company management.

### 2.1 Technical Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Frontend | Next.js 14 (App Router) | React-based, great DX, Vercel-native |
| Backend API | Next.js API Routes | Unified codebase, serverless |
| Database | PostgreSQL (Supabase) | Managed, auth integration, realtime |
| Authentication | Supabase Auth / NextAuth.js | OAuth providers, magic links |
| Hosting | Vercel | Zero-config deployment, edge functions |
| Background Jobs | Vercel Cron / Inngest | Scheduled data collection |
| AI Analysis | Google Gemini API | Already integrated |

### 2.2 User Stories

#### Authentication & Access Control

| ID | User Story | Priority |
|----|------------|----------|
| U-1 | As a user, I can sign in with Google/Microsoft SSO so I don't need another password | P0 |
| U-2 | As an admin, I can invite users via email to grant them access | P0 |
| U-3 | As an admin, I can define user roles (viewer, editor, admin) | P1 |
| U-4 | As a user, I can see only companies my organization is tracking | P1 |

#### Dashboard & Insights

| ID | User Story | Priority |
|----|------------|----------|
| D-1 | As a user, I can see a dashboard with key metrics (new postings, trends, alerts) | P0 |
| D-2 | As a user, I can filter insights by company, category, or date range | P0 |
| D-3 | As a user, I can view detailed analysis for any job posting | P0 |
| D-4 | As a user, I can see historical trends visualized in charts | P1 |
| D-5 | As a user, I can compare hiring activity across competitors | P1 |
| D-6 | As a user, I can export data to CSV/Excel | P1 |

#### Company Management

| ID | User Story | Priority |
|----|------------|----------|
| C-1 | As an editor, I can add a new company to track | P0 |
| C-2 | As an editor, I can configure a company's ATS type and identifier | P0 |
| C-3 | As an editor, I can mark a company for strategic analysis (or template-only) | P1 |
| C-4 | As an editor, I can pause/resume tracking for a company | P2 |
| C-5 | As a user, I can see the status of each company's scraper | P1 |

#### Job Template Library

| ID | User Story | Priority |
|----|------------|----------|
| T-1 | As a user, I can browse job templates by category | P1 |
| T-2 | As a user, I can search job templates by keyword | P1 |
| T-3 | As a user, I can view the full text of any job posting | P0 |
| T-4 | As a user, I can bookmark/favorite job templates | P2 |
| T-5 | As a user, I can copy job template text to clipboard | P1 |

#### Notifications & Alerts

| ID | User Story | Priority |
|----|------------|----------|
| N-1 | As a user, I can receive weekly email digests | P1 |
| N-2 | As a user, I can set up alerts for specific keywords or companies | P2 |
| N-3 | As a user, I can choose my notification preferences | P2 |

### 2.3 Information Architecture

```
/                           → Dashboard (requires auth)
├── /insights               → Strategic Insights List
│   └── /insights/[id]      → Individual Insight Detail
├── /companies              → Company Management
│   ├── /companies/add      → Add New Company
│   └── /companies/[slug]   → Company Detail & Jobs
├── /jobs                   → All Job Postings
│   └── /jobs/[id]          → Job Detail
├── /templates              → Job Template Library
│   └── /templates/[category] → Templates by Category
├── /reports                → Report Generation
├── /settings               → User & Org Settings
├── /admin                  → Admin Panel (admin only)
│   ├── /admin/users        → User Management
│   └── /admin/audit        → Audit Logs
└── /api                    → API Routes
    ├── /api/auth           → Authentication
    ├── /api/companies      → Company CRUD
    ├── /api/jobs           → Job Postings
    ├── /api/insights       → Strategic Insights
    ├── /api/cron/collect   → Scheduled Collection
    └── /api/cron/report    → Scheduled Reports
```

### 2.4 Database Schema (PostgreSQL)

```sql
-- Organizations (multi-tenant support)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    organization_id UUID REFERENCES organizations(id),
    email TEXT NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'viewer', -- viewer, editor, admin
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Companies (existing schema + org association)
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    country TEXT NOT NULL,
    track_for_strategy BOOLEAN DEFAULT FALSE,
    ats_type TEXT NOT NULL,
    ats_identifier TEXT,
    careers_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(organization_id, slug)
);

-- Job Postings (existing schema + indexes)
CREATE TABLE job_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Indexes for performance
CREATE INDEX idx_job_postings_company ON job_postings(company_id);
CREATE INDEX idx_job_postings_first_seen ON job_postings(first_seen_date);
CREATE INDEX idx_job_postings_active ON job_postings(is_active) WHERE is_active = TRUE;

-- Strategic Insights (existing schema)
CREATE TABLE strategic_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_posting_id UUID REFERENCES job_postings(id) ON DELETE CASCADE,
    run_date TIMESTAMPTZ DEFAULT NOW(),
    category TEXT,
    insight_summary TEXT,
    strategic_signals JSONB,
    is_new_direction BOOLEAN DEFAULT FALSE,
    confidence TEXT
);

-- Audit Log
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.5 UI Wireframes

#### Dashboard
```
┌────────────────────────────────────────────────────────────────────────┐
│  🏦 Fintech Intelligence                    [Search]    [👤 User ▼]   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │     105      │ │      5       │ │      3       │ │     +12      │  │
│  │ Active Jobs  │ │  New Today   │ │   Insights   │ │  This Week   │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
│                                                                        │
│  Recent Insights                                        [View All →]   │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ 🟡 Wealthsimple | Director of Design, Portfolios              │   │
│  │    Leadership hire signals investment in wealth product UX     │   │
│  ├────────────────────────────────────────────────────────────────┤   │
│  │ 🟢 Wealthsimple | Associate, Fraud Investigations             │   │
│  │    Operational scaling in fraud prevention capabilities        │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  Hiring by Company (30 days)                                          │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │  Wealthsimple  ████████████████████████████████████  40        │   │
│  │  Monzo         ████████████████████████████████████████  51    │   │
│  │  Starling      ██████████  10                                  │   │
│  │  Questrade     ████  4                                         │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

#### Add Company Flow
```
┌────────────────────────────────────────────────────────────────────────┐
│  Add New Company                                              [Close]  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Company Name *                                                        │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ EQ Bank                                                        │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  Country *                          Track for Strategic Analysis?      │
│  ┌─────────────────────┐           ┌─────────────────────────────┐   │
│  │ Canada          ▼   │           │ ☑ Yes - Analyze for insights│   │
│  └─────────────────────┘           └─────────────────────────────┘   │
│                                                                        │
│  ATS Platform *                                                        │
│  ┌─────────────────────┐                                              │
│  │ Select platform  ▼  │                                              │
│  ├─────────────────────┤                                              │
│  │ ○ Lever             │                                              │
│  │ ○ Greenhouse        │                                              │
│  │ ○ Workable          │                                              │
│  │ ○ Workday           │                                              │
│  │ ○ Other (manual)    │                                              │
│  └─────────────────────┘                                              │
│                                                                        │
│  ATS Identifier *                                                      │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ eqbank                                                         │   │
│  └────────────────────────────────────────────────────────────────┘   │
│  ℹ️ Usually found in their careers page URL (e.g., jobs.lever.co/X)   │
│                                                                        │
│  Careers Page URL                                                      │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ https://www.eqbank.ca/careers                                  │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│                              [Test Connection]  [Cancel]  [Add Company]│
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.6 API Design

#### Authentication
All API routes require authentication via Supabase JWT or API key.

```typescript
// Example API Routes

// GET /api/companies
// Returns list of companies for the user's organization
Response: {
  companies: [{
    id: string,
    name: string,
    slug: string,
    country: string,
    atsType: string,
    isActive: boolean,
    activeJobCount: number,
    lastCollected: string
  }]
}

// POST /api/companies
// Add a new company to track
Request: {
  name: string,
  country: string,
  atsType: 'lever' | 'greenhouse' | 'workable' | 'workday' | 'custom',
  atsIdentifier: string,
  trackForStrategy: boolean,
  careersUrl?: string
}

// POST /api/companies/:id/test
// Test scraper connection for a company
Response: {
  success: boolean,
  jobCount?: number,
  error?: string
}

// GET /api/insights
// Get strategic insights with filtering
Query: {
  company?: string,
  category?: string,
  since?: string,
  limit?: number
}

// POST /api/cron/collect
// Triggered by Vercel Cron - runs daily collection
Headers: { Authorization: 'Bearer CRON_SECRET' }
```

### 2.7 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                              Vercel                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐     ┌──────────────────┐                      │
│  │   Next.js App    │     │   API Routes     │                      │
│  │   (Frontend)     │────▶│   (Backend)      │                      │
│  │                  │     │                  │                      │
│  │  • Dashboard     │     │  • /api/auth     │                      │
│  │  • Insights      │     │  • /api/companies│                      │
│  │  • Companies     │     │  • /api/jobs     │                      │
│  │  • Templates     │     │  • /api/insights │                      │
│  └──────────────────┘     └────────┬─────────┘                      │
│                                    │                                 │
│  ┌──────────────────┐              │                                │
│  │   Vercel Cron    │──────────────┤                                │
│  │                  │              │                                │
│  │  • Daily 6 AM    │              │                                │
│  │  • Weekly Mon    │              │                                │
│  └──────────────────┘              │                                │
│                                    │                                 │
└────────────────────────────────────┼─────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
           ┌──────────────┐  ┌─────────────┐  ┌─────────────┐
           │   Supabase   │  │   Gemini    │  │  External   │
           │              │  │   API       │  │  ATS APIs   │
           │  • Postgres  │  │             │  │             │
           │  • Auth      │  │  Strategic  │  │  • Lever    │
           │  • Realtime  │  │  Analysis   │  │  • Greenhouse│
           │              │  │             │  │  • Workable │
           └──────────────┘  └─────────────┘  └─────────────┘
```

### 2.8 Implementation Timeline

| Week | Milestone | Deliverables |
|------|-----------|--------------|
| 1 | Project Setup | Next.js project, Supabase setup, Vercel deployment |
| 2 | Authentication | SSO integration, user management, roles |
| 3 | Database Migration | PostgreSQL schema, data migration from SQLite |
| 4 | Core API | Companies, jobs, insights endpoints |
| 5 | Dashboard | Main dashboard, metrics cards, recent insights |
| 6 | Company Management | Add/edit companies, test connections |
| 7 | Insights & Jobs | Insights list, job detail, search/filter |
| 8 | Templates | Template library, categories, copy functionality |
| 9 | Cron & Notifications | Scheduled jobs, email digests |
| 10 | Polish & Launch | Testing, bug fixes, documentation |

---

## Phase 3: Advanced Features (Future)

### 3.1 Enhanced Analytics

- **Trend Visualization**: Interactive charts showing hiring velocity over time
- **Competitive Benchmarking**: Side-by-side company comparisons
- **Department Analysis**: Breakdown of hiring by function (Eng, Product, etc.)
- **Geographic Insights**: Map visualization of hiring locations

### 3.2 AI Enhancements

- **Predictive Signals**: ML model to predict strategic moves based on patterns
- **Automated Summaries**: Weekly AI-generated executive briefings
- **Sentiment Analysis**: Gauge company health from job posting language
- **Skill Tracking**: Extract and track in-demand skills over time

### 3.3 Collaboration Features

- **Comments & Notes**: Team annotations on insights
- **Shared Watchlists**: Collaborative company tracking
- **Slack Integration**: Real-time alerts to Slack channels
- **API Access**: Programmatic access for custom integrations

### 3.4 Data Expansion

- **LinkedIn Integration**: Supplement with LinkedIn job data
- **Glassdoor Reviews**: Company health indicators
- **Funding Data**: Correlate hiring with funding rounds
- **News Integration**: Link hiring to press releases

---

## Technical Architecture

### Current State (Phase 1)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Local Development                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   Python    │    │   SQLite    │    │   Cron (local)      │ │
│  │   CLI       │───▶│   Database  │◀───│   Scheduling        │ │
│  │             │    │             │    │                     │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
│        │                                                        │
│        ▼                                                        │
│  ┌─────────────┐    ┌─────────────┐                            │
│  │   Gemini    │    │   SMTP      │                            │
│  │   API       │    │   Email     │                            │
│  └─────────────┘    └─────────────┘                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Target State (Phase 2)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Production (Vercel + Supabase)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │  Next.js    │    │  PostgreSQL │    │   Vercel Cron       │ │
│  │  App        │───▶│  (Supabase) │◀───│   + Edge Functions  │ │
│  │             │    │             │    │                     │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
│        │                  │                                     │
│        ▼                  ▼                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │  Supabase   │    │   Gemini    │    │   Resend / SendGrid │ │
│  │  Auth       │    │   API       │    │   (Email)           │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Success Metrics

### Phase 1 KPIs (Current)

| Metric | Target | Status |
|--------|--------|--------|
| Companies tracked | 8 | 5 active |
| Job postings in database | 100+ | 105 |
| Strategic insights generated | 50+ | 5 (testing) |
| System reliability | 95% | Manual |

### Phase 2 KPIs (Planned)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Active users | 10+ | Monthly active users |
| Companies tracked | 20+ | Total in database |
| Data freshness | < 24 hours | Time since last collection |
| Page load time | < 2 seconds | Core Web Vitals |
| User satisfaction | > 4.0/5 | In-app feedback |
| Report open rate | > 60% | Email analytics |

---

## Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| ATS | Applicant Tracking System - software used to manage job postings |
| Strategic Analysis | AI-powered interpretation of hiring signals |
| Longitudinal Data | Historical tracking over time |
| Job Template | A categorized job description for reference |

### B. Competitor ATS Reference

| ATS | API Documentation | Notes |
|-----|-------------------|-------|
| Lever | `api.lever.co/v0/postings/{company}` | Public, no auth |
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{company}/jobs` | Public, no auth |
| Workable | `apply.workable.com/api/v3/accounts/{company}/jobs` | Public, POST |
| Workday | Varies by implementation | Requires custom scraping |

### C. File Structure (Phase 2)

```
fintech-intelligence/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── signup/
│   ├── (dashboard)/
│   │   ├── page.tsx              # Dashboard
│   │   ├── insights/
│   │   ├── companies/
│   │   ├── jobs/
│   │   ├── templates/
│   │   └── settings/
│   ├── api/
│   │   ├── auth/
│   │   ├── companies/
│   │   ├── jobs/
│   │   ├── insights/
│   │   └── cron/
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                       # shadcn/ui components
│   ├── dashboard/
│   ├── companies/
│   └── insights/
├── lib/
│   ├── supabase/
│   ├── scrapers/                 # Ported from Python
│   ├── analysis/                 # Gemini integration
│   └── utils/
├── public/
├── supabase/
│   └── migrations/
├── package.json
├── next.config.js
└── vercel.json
```

### D. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| ATS API changes | High | Medium | Version monitoring, graceful degradation |
| Rate limiting | Medium | Medium | Request throttling, caching |
| Gemini API costs | Medium | Low | Usage monitoring, batch processing |
| Data accuracy | High | Low | Manual spot-checking, user feedback |
| Security breach | Critical | Low | Auth best practices, audit logging |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-17 | Product Team | Initial PRD |

---

*This document is confidential and intended for internal use only.*
