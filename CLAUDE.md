# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fintech Job Intelligence System - a competitive intelligence platform tracking job postings from fintech companies. Two components:
- **Python CLI backend** (`/src`): Scraping, analysis, and reporting
- **Next.js web app** (`/web`): Dashboard hosted on Vercel

## Common Commands

### Web App (Next.js)
```bash
cd web
npm run dev      # Dev server on port 3000
npm run build    # Production build
npm run lint     # ESLint
```

### Python Backend
```bash
./run.sh init                        # Initialize database
./run.sh collect --analyze           # Collect jobs with AI analysis
./run.sh collect -c wealthsimple     # Collect specific company
./run.sh report --preview            # Preview weekly report
./run.sh test-scraper -c company     # Test company scraper
./run.sh test-email                  # Test email config
```

### Database Scripts
```bash
npx tsx web/scripts/run-migration.ts     # Run migrations
npx tsx web/scripts/verify-migration.ts  # Verify migration
```

## Architecture

### Tech Stack
- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui, TanStack Query
- **Backend**: Python with Click CLI, SQLAlchemy 2.0, BeautifulSoup4
- **Database**: Supabase (PostgreSQL) with RLS
- **Auth**: Supabase SSR with Google OAuth
- **AI**: Gemini 3 Flash for strategic analysis
- **Email**: Resend API
- **Scraping**: Puppeteer Core (serverless) + BeautifulSoup4

### Key Patterns

**Scraper Factory** (`src/scrapers/__init__.py`): `get_scraper()` returns appropriate scraper for ATS type (Lever, Greenhouse, Workable, custom).

**API Routes**: Next.js API routes at `/web/app/api/` handle CRUD and cron jobs. All use Zod validation.

**Auth Middleware** (`web/middleware.ts`): Protects all routes except `/login`, `/api`, `/auth`.

**Component Structure**:
- `/web/components/ui/` - shadcn/ui primitives
- `/web/components/{feature}/` - Feature-specific components

**TypeScript Paths**: `@/*` maps to `/web/*`

### Database Tables
- `companies` - Tracked companies with ATS configs
- `job_postings` - Job listings with descriptions
- `strategic_insights` - AI-generated analysis
- `posting_events` - Timeline tracking
- `job_templates` - Categorized templates

### Cron Jobs (Vercel)
- Daily 6 AM: `/api/cron/collect` - Collect jobs and analyze
- Weekly Monday 8 AM: `/api/cron/report` - Generate reports

## Configuration

### Company Config (`config/companies.yaml`)
Each company needs: `name`, `slug`, `country`, `track_for_strategy`, `ats_type`, `ats_identifier`

### Environment Variables
- `GEMINI_API_KEY` - AI analysis
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase client
- `SUPABASE_SERVICE_ROLE_KEY` - Server-side operations
- `RESEND_API_KEY` - Email delivery
- `CRON_SECRET` - Vercel cron authentication

## Adding New ATS Support

1. Create scraper in `src/scrapers/` implementing `BaseScraper`
2. Add to factory in `src/scrapers/__init__.py`
3. For web scrapers: add to `web/lib/scrapers/`
