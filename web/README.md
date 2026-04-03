# The Fintech Talent Brief — Web App

Next.js 14 web application for the Fintech Competitive Intelligence Platform.

## Environment Variables

Create `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
CRON_SECRET=your-random-secret-string
RESEND_API_KEY=your-resend-api-key
RESEND_FROM=reports@yourdomain.com
REPORT_EMAIL=team@yourdomain.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Setup

1. Run Supabase migrations in `supabase/migrations/` via the Supabase SQL Editor.
2. Configure Google/Microsoft OAuth in Supabase Dashboard > Authentication > Providers.
3. Copy `.env.local` from the variables above.
4. `npm run dev` to start.

## Data Migration

To migrate existing SQLite data to Supabase:

```bash
# From project root
npx tsx web/scripts/migrate-sqlite.ts
```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Cron

Vercel Cron runs:
- `/api/cron/collect` daily at 6:00 UTC
- `/api/cron/report` Mondays at 8:00 UTC

Set `CRON_SECRET` and configure Vercel to send `Authorization: Bearer <CRON_SECRET>`.
