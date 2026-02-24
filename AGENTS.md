# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a two-component monorepo for **The Fintech Talent Brief**, a fintech hiring intelligence platform:

- **Next.js web app** (`/web`) — primary product; Next.js 16, React 19, Tailwind CSS 4, Supabase, deployed on Vercel
- **Python CLI backend** (`/src`) — legacy scraping pipeline; incomplete (missing `src/analysis/strategic.py` and `src/analysis/categorizer.py`), not required for web app development

### Running the web app

```bash
cd web && npm run dev   # Dev server on http://localhost:3000
```

Standard commands for lint/build/dev are in `web/package.json` (`npm run lint`, `npm run build`, `npm run dev`). See `CLAUDE.md` for full command reference.

### Environment variables

The web app requires a `web/.env.local` with at minimum:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-side)
- `GEMINI_API_KEY` — Google Gemini API key
- `CRON_SECRET` — Cron endpoint auth

Placeholder values allow the app to build and serve pages, but API routes and auth require real Supabase credentials.

### Gotchas

- **Lint exits non-zero**: The codebase has ~60 pre-existing ESLint errors (mostly `@typescript-eslint/no-explicit-any` and React hooks purity warnings). Lint runs fine but always returns exit code 1.
- **Python CLI is broken**: The `src/analysis/` module references files that don't exist (`strategic.py`, `categorizer.py`). The Python backend is legacy; the web app's TypeScript analysis (`web/lib/analysis/`) is the active implementation.
- **python3-venv**: System python3 doesn't come with `python3.12-venv` pre-installed; it must be installed via apt before creating the virtualenv.
- **Auth redirects**: The proxy (`web/proxy.ts`) redirects all non-API, non-auth routes to `/login` when unauthenticated. Use `/login` or `/api/*` routes for testing without auth.
- **Package manager**: Uses `npm` (lockfile is `package-lock.json`).
