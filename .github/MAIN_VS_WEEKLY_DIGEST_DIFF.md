# main vs weekly-digest Branch Difference Summary

**Generated:** For bringing `main` into `weekly-digest` (dashboard changes, etc.)

## Branch relationship

- **main** (local): `d4268b1` — "Fix cron job authentication and improve JSON extraction error handling"
- **weekly-digest**: `803c654` — "Merge pull request #3 from tascheidt/unified-job-tracking"
- **main** is ahead of **weekly-digest**; it contains dashboard redesign, multi-user digest, and related work that **weekly-digest** does not have.

## Favicon

- **`web/app/favicon.ico`**: Same blob on both branches. No diff. No update needed.

## What main has that weekly-digest is missing

### Dashboard & UI

| Path | Change on main |
|------|----------------|
| `web/app/(dashboard)/page.tsx` | Strategic highlights redesign: fetch more insights, deduplicate by company, keep top 10 by significance. Limit 50 → dedup → top 10. |
| `web/app/(dashboard)/layout.tsx` | Layout tweaks. |
| `web/app/(dashboard)/companies/[slug]/page.tsx` | Company page updates. |
| `web/app/(dashboard)/companies/[slug]/insights/page.tsx` | Insights page updates. |
| `web/app/(dashboard)/insights/page.tsx` | Insights list updates. |
| `web/app/(dashboard)/settings/page.tsx` | Settings page updates. |
| `web/components/dashboard/StrategicHighlights.tsx` | Strategic highlights component updates. |
| `web/components/dashboard/CompaniesOverview.tsx` | Companies overview updates. |
| `web/components/layout/DashboardNav.tsx` | Nav updates (e.g. +81 lines). |
| `web/components/layout/UserMenu.tsx` | User menu updates. |
| `web/components/insights/DigestArchive.tsx` | Digest archive updates. |
| `web/components/insights/LatestDigestInsights.tsx` | Latest digest updates. |
| `web/components/companies/*` | CompanyInsightsCard, GenerateInsightButton, JobHistoryView updates. |
| `web/components/ui/*` | button, card, dialog, input, notion-card, select, **sheet** (new), **switch** (new), tabs. |
| `web/app/globals.css` | Global style changes. |
| `web/app/layout.tsx` | Root layout metadata/viewport (Fintech Intelligence, etc.). |

### API & backend

| Path | Change on main |
|------|----------------|
| `web/app/api/cron/report/route.ts` | Report cron: weekly digest persistence, multi-user email, etc. (+232 lines). |
| `web/app/api/cron/company-insights/route.ts` | Company insights cron updates. |
| `web/app/api/companies/[id]/insights/route.ts` | Insights API updates. |
| `web/app/api/admin/cron-logs/route.ts` | Cron logs updates. |
| `web/app/api/admin/stats/route.ts` | Admin stats updates. |
| `web/app/api/user/email-preferences/route.ts` | **New** email preferences API. |
| `web/proxy.ts` | Proxy updates (+12 lines). |

### Libraries & email

| Path | Change on main |
|------|----------------|
| `web/lib/analysis/company-insights.ts` | Larger refactor (~437 lines changed). |
| `web/lib/analysis/company-research.ts` | Updates (+203 lines). |
| `web/lib/email/templates/weekly-digest.tsx` | Small template tweaks. |

### Migrations

| Path | On main only |
|------|----------------|
| `web/supabase/migrations/20260122120000_insight_generation_locks.sql` | Insight generation locks. |
| `web/supabase/migrations/20260124000000_multi_user_digest.sql` | Multi-user digest schema. |
| `web/supabase/migrations/20260125000000_unified_job_tracking.sql` | Unified job tracking. |

### Docs & config

| Path | On main only |
|------|----------------|
| `CLAUDE.md` | Project notes. |
| `docs/WEEKLY_DIGEST_EMAIL_ARCHITECTURE.md` | Digest architecture. |
| `docs/MULTI_USER_DIGEST_TEST_RESULTS.md` | Multi-user digest tests. |
| `docs/COMPANY_INSIGHTS_JSON_FIX.md` | Company insights JSON fix. |
| `docs/CRON_*`, `docs/VERCEL_CRON_*` | Cron-related docs. |
| `.github/ISSUES/*`, `.github/PLANS/*` | Various issues and plans. |
| `web/scripts/test-multi-user-digest.ts` | Multi-user digest test script. |
| `web/components/settings/EmailPreferences.tsx` | **New** email preferences UI. |
| `web/package-lock.json` | Lockfile changes. |

## What was done (dashboard + favicon)

`git merge main` reported **already up to date** (weekly-digest already contains main’s history via the unified-job-tracking merge). The merge resolution had left **weekly-digest** with different file contents for dashboard/layout.

The following were **checkout from main** to align **weekly-digest** with main’s dashboard and favicon:

- `web/app/(dashboard)/**` (page, layout, settings, companies, insights)
- `web/app/layout.tsx`, `web/app/globals.css`, `web/app/favicon.ico`
- `web/components/dashboard/**`, `web/components/layout/**`, `web/components/insights/*` (DigestArchive, LatestDigestInsights)
- `web/components/companies/*` (CompanyInsightsCard, GenerateInsightButton, JobHistoryView)
- `web/components/ui/*` (button, card, dialog, input, notion-card, select, tabs)
- `web/app/api/admin/cron-logs`, `web/app/api/admin/stats`
- `web/proxy.ts`

**Not overwritten** (left as on weekly-digest / your WIP): `web/lib/analysis/*`, `web/lib/email/templates/weekly-digest.tsx`, `web/app/api/cron/report`, `web/app/api/companies/.../insights`, etc.

Build verified after checkout (`npm run build`).

## Favicon note

`web/app/favicon.ico` is identical on both branches (same blob). It was included in the checkout from main for consistency. Layout metadata (`layout.tsx`) on **main** matches the Fintech app (title, viewport, etc.).
