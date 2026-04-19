# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Fintech Talent Brief - a hiring intelligence platform tracking job postings from fintech companies. Two components:
- **Python CLI backend** (`/src`): Scraping, analysis, and reporting
- **Next.js web app** (`/web`): Dashboard hosted on Vercel

## Project Asthetic 
"Notion-sytle" - Clean white or very subtle off-white/light gray theme with clean, high contrast typography, or a refined dark theme if strictly required

## Editorial voice (AI copy)
User-facing AI prose (digests, job/company insights, chat, strategy narrative) follows **docs/voice.md**. Runtime rules live in `web/lib/ai/voice.ts`; heuristic checks in `web/lib/ai/voice-validator.ts`. When changing tone, update the doc and keep `voice.ts` in sync in the same PR.

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

## Build & Deployment

### Vercel Build Requirements

**IMPORTANT: Always run `npm run build` locally before pushing to catch TypeScript errors.**

Vercel runs strict TypeScript checking during builds. Common issues:

1. **Type Errors**: Vercel's TypeScript compiler is stricter than local dev. Always verify types:
   - Use correct property names (e.g., `ZodError.issues`, not `ZodError.errors`)
   - Ensure all imports are typed correctly
   - Check that optional chaining/nullish coalescing is used appropriately

2. **Pre-deployment Checklist**:
   ```bash
   cd web
   npm run build  # Must pass before pushing
   npm run lint   # Check for linting issues
   ```

3. **Common TypeScript Mistakes**:
   - Accessing non-existent properties on types (e.g., `error.errors` on `ZodError` - use `error.issues`)
   - Missing type assertions or guards
   - Incorrect generic type parameters

## Architecture

### Tech Stack
- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui, TanStack Query
- **Backend**: Python with Click CLI, SQLAlchemy 2.0, BeautifulSoup4
- **Database**: Supabase (PostgreSQL) with RLS
- **Auth**: Supabase SSR with Google OAuth
- **AI**: Google Gemini via floating `-latest` aliases (`gemini-flash-latest`, `gemini-pro-latest`) for strategic analysis
- **Email**: Resend API
- **Scraping**: Puppeteer Core (serverless) + BeautifulSoup4

### Key Patterns

**Scraper Factory** (`src/scrapers/__init__.py`): `get_scraper()` returns appropriate scraper for ATS type (Lever, Greenhouse, Workable, custom).

**API Routes**: Next.js API routes at `/web/app/api/` handle CRUD and cron jobs. All use Zod validation.

**Auth Proxy** (`web/proxy.ts`): Protects all routes except `/login`, `/api`, `/auth`. Uses Next.js 16 proxy convention (runs in Node.js runtime).

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
- `job_runs` - Unified job tracking for all scheduled/manual jobs

### Job Tracking (IMPORTANT)

**All scheduled jobs and manual operations MUST use the `job_runs` table for tracking.**

The `cron_logs` table has been deprecated and removed. Never reference or use `cron_logs`.

#### Valid job_types
- `collect` - Job scraping/collection
- `analyze` - AI analysis of job postings
- `report` - Weekly digest generation
- `company-insights` - Scheduled company insight generation
- `insight-generation` - Manual company insight generation

#### Status values
- `pending` - Job queued but not started
- `running` - Job currently executing
- `completed` - Job finished successfully
- `failed` - Job finished with error
- `cancelled` - Job was cancelled

#### Example: Logging a job run
```typescript
// Create job run entry at start
const { data: jobRun } = await supabase
  .from("job_runs")
  .insert({
    job_type: "report",           // One of the valid types above
    trigger_type: "cron",         // 'cron' | 'manual' | 'admin'
    scope: "all",                 // 'all' | 'single'
    status: "running",
    started_at: new Date().toISOString(),
  })
  .select("id")
  .single();

// Update on completion
await supabase
  .from("job_runs")
  .update({
    status: "completed",          // or "failed"
    completed_at: new Date().toISOString(),
    total_companies: 5,
    total_insights: 5,
    details: { /* job-specific metadata */ },
  })
  .eq("id", jobRun.id);
```

### Cron Jobs (Vercel)
- Daily 6 AM: `/api/cron/collect` - Collect jobs and analyze
- Weekly Monday 5 AM: `/api/cron/report` - Generate reports
- Never create more than two cron jobs

## Configuration

### Company Config (`config/companies.yaml`)
Each company needs: `name`, `slug`, `country`, `ats_type`, `ats_identifier`

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

## Release / Changelog

**Every user-facing or notable change MUST include a changelog update.**

### How to update
1. Open `web/data/releases.json`
2. Add a bullet to the current version's `changes` array, or create a new version entry if shipping a version bump
3. Use the correct change type: `"feature"` (new functionality), `"fix"` (bug fix), `"improvement"` (enhancement to existing feature)
4. Keep descriptions to one sentence

### When to bump the version
- **patch** (1.0.x): bug fixes only
- **minor** (1.x.0): new features or improvements
- **major** (x.0.0): breaking changes or major redesigns
- Bump in both `web/package.json` and `web/data/releases.json`

### What counts as "notable"
- Any new page, feature, or UI component
- Bug fixes that affected user-visible behavior
- Performance improvements users would notice
- Changes to the email digest format

### What does NOT need a changelog entry
- Internal refactors with no user-visible effect
- Dev tooling, CI/CD, or test changes
- Dependency updates (unless they change behavior)

## AI Model Requirements

**IMPORTANT: Always use the floating `-latest` model aliases. Never pin a versioned or preview model ID.**

Using `-latest` aliases means new model generations roll through without code changes. The tradeoff is that Google may rotate the alias to a preview/experimental release; the Phase-1 comparison harness (`web/scripts/gemini-compare.ts`) and Phase-5 production telemetry are how we detect regressions.

### Approved Models
- `gemini-pro-latest` — Advanced analysis with web search/grounding; deeper reasoning and narrative quality
- `gemini-flash-latest` — Fast, cost-effective analysis; default for extraction, classification, digest, chat
- `gemini-flash-lite-latest` — Cheapest tier for high-volume, low-stakes calls (use only where the comparison report confirms ≥95% L1 field agreement)

### Rules
1. **Never pin a versioned or preview model ID** (e.g. `gemini-3-flash-preview`, `gemini-2.0-flash`, `gemini-1.5-pro`). Always use the `-latest` alias.
2. All AI code must resolve its model through the `AI_MODEL_OPTIONS` enum in `web/lib/ai/prompt-config.ts` — do not hardcode strings outside that module.
3. Use Pro (`gemini-pro-latest`) only for features requiring web-search grounding or deep synthesis; Flash covers standard JSON generation and analysis.
4. When adding a new call site, verify whether an upstream call already enables `googleSearch` grounding — two grounded Pro calls in series cost as much as one and produce duplicate work.

### AI call-site hygiene

Rules for every Gemini call. These exist because Gemini cost drifted above target in April 2026 and cost the team a round of debugging we don't want to repeat:

1. **Every new call-site must be observable.** Production analysis functions accept an optional `onUsage: OnUsage` callback from `@/lib/ai/gemini-meter` and fire it with the real `usageMetadata` after each call. When you add a new call-site, wire the hook the same way. Production callers pass nothing; tools pass an observer. Phase 5 of the cost-reduction plan will turn this into unconditional telemetry to `gemini_usage_events`.
2. **PRs touching `web/lib/ai/**` or `web/lib/analysis/**` must run `gemini-compare.ts` and attach the markdown report to the PR description.** Use `npx tsx --env-file=.env.local scripts/gemini-compare.ts --scenario=<name> --mode=baseline` (or `--mode=compare --baseline=<prior-artifact>`) and commit the resulting JSON under `web/scripts/artifacts/`. The seeded 20-job fixture at `web/scripts/fixtures/gemini-sample-jobs.json` is the source of truth — regenerate annually, not per change.
3. **Before adding a new grounded (`googleSearch`) call, check whether an upstream call already enables grounding.** The Apr 2026 incident was two grounded Pro calls firing per new job in `analyzeJobAdvanced` — avoid duplicating grounded calls.
4. **Response caches must include `prompt_config_version` in the cache key.** Otherwise prompt tweaks silently serve stale outputs forever.
5. **The voice directive from `web/lib/ai/voice.ts` is mandatory on user-facing surfaces** (digest, company insight, chat, narrative) and forbidden on internal extraction/classification prompts. Extraction output is never shown to users; the voice rules only eat tokens there.

### Ingestion pipeline reality

The live per-job hot path after `collect` runs is:

```
processor.ts  → extractAndUpdateStructure  → extractJobStructure  (Flash)
analyzer.ts   → analyzeJobAdvanced  → performWebSearch (Pro+grounded, pre-fetch)
                                   → analyzeJobAdvanced main call (Pro+grounded)
```

`analyzeJob` in [web/lib/analysis/strategic.ts](web/lib/analysis/strategic.ts) and `categorizePosting` in [web/lib/analysis/categorizer.ts](web/lib/analysis/categorizer.ts) are **not** on the live ingestion path — they exist for backfill and legacy flows. Do not wire into those functions without an explicit decision; do not assume the 8000-char cap in `strategic.ts` applies to production analyses.

### Quota Errors
If you see `limit: 0` quota errors, the API key may need:
1. Billing enabled on the Google Cloud project
2. Gemini API enabled in the project
3. Access granted to preview models (request at https://ai.google.dev/)
