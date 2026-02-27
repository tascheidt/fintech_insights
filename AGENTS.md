# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a two-component codebase: a **Next.js web dashboard** (`/web`) and a **legacy Python CLI** (`/src`). The web app is the primary product; the Python CLI is largely superseded and has missing modules (`src/analysis/strategic.py`, `src/analysis/categorizer.py`).

### Running the web app

- Dev server: `cd web && npm run dev` (port 3000)
- Build: `cd web && npm run build`
- Lint: `cd web && npm run lint` (pre-existing lint errors exist — 60+ `no-explicit-any` and React hooks warnings)
- See `CLAUDE.md` for full command reference

### Environment variables

The web app requires a `web/.env.local` file. Required variables:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — without real Supabase credentials, the app starts but all data-dependent routes return errors or redirect to login
- `GEMINI_API_KEY` — required for AI analysis features
- `RESEND_API_KEY` — optional, email delivery
- `CRON_SECRET` — optional, cron endpoint auth

### Non-obvious caveats

- **Auth proxy** (`web/proxy.ts`): All routes except `/login`, `/api`, `/auth` require authentication. Unauthenticated requests are redirected to `/login`.
- **No Docker or local DB needed**: The web app uses hosted Supabase (PostgreSQL); the Python CLI uses local SQLite (`data/jobs.db`).
- **Build before push**: Vercel runs strict TypeScript checking. Always run `npm run build` in `/web` before pushing.
- **Package manager**: Uses `npm` (lockfile is `package-lock.json`).
