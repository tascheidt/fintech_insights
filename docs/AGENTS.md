# Agents Manual

Operator's manual for any coding agent (human or AI) entering this repo. If you only read one doc, read root [`CLAUDE.md`](../CLAUDE.md). This file is the second one.

## Before you start

1. Read [`CLAUDE.md`](../CLAUDE.md). It has the cron count, the AI model rules, and the conventions.
2. Skim [`docs/CRON_TOPOLOGY.md`](./CRON_TOPOLOGY.md) so you know the Vercel-2 + GitHub-Actions-1 split before you propose a "just add a cron" change.
3. Skim [`docs/AI_HYGIENE.md`](./AI_HYGIENE.md) before you touch anything in `web/lib/ai/**` or `web/lib/analysis/**`.
4. If your change is on a user-facing AI surface, read [`docs/voice.md`](./voice.md).
5. Check the per-area sub-CLAUDE files for the directory you're editing:
   - `web/lib/ai/CLAUDE.md`
   - `web/lib/analysis/CLAUDE.md`
   - `web/lib/scrapers/CLAUDE.md`
   - `web/lib/auth/CLAUDE.md`

## Adding a new API route

Checklist for `web/app/api/**` additions:

- [ ] **Auth guard** — import from `web/lib/auth/guards.ts`. Don't reinvent auth.
- [ ] **Zod schema** — every request body parsed through Zod. Use `result.error.issues`, not `.errors`.
- [ ] **Logging** — `log.*` from `@/lib/log`, not raw `console.*`.
- [ ] **Gemini telemetry** — if your route calls Gemini directly (most don't; they go through helpers in `web/lib/ai/` and `web/lib/analysis/`), confirm the helper writes to `gemini_usage_events`. New direct call sites must wire `recordUsage` + `writeUsageEvent` themselves. See [`docs/AI_HYGIENE.md`](./AI_HYGIENE.md).
- [ ] **Changelog** — append to `web/data/releases.json` if user-facing.
- [ ] **Doc update** — if the route changes architecture, conventions, or env vars, update the relevant `.md` file in the same PR.

## Adding a new scheduled job

Decision tree:

1. Will the job complete in well under Vercel's serverless function ceiling and run on a daily-or-less cadence?
   - **And** are there fewer than two existing Vercel crons in `vercel.json`?
   - → Vercel cron under `/api/cron/<name>`. Add to `vercel.json`. Update `docs/CRON_TOPOLOGY.md`.
2. Otherwise (long-running, bursty, browser-heavy, or you'd be the third Vercel cron):
   - → GitHub Actions workflow in `.github/workflows/`. See `scrape-heavy.yml` for the pattern. Update `docs/CRON_TOPOLOGY.md`.

The hard cap is **two** Vercel crons. The third scheduled job moved to GitHub Actions for a reason — see `docs/CRON_TOPOLOGY.md`.

All scheduled jobs MUST log into the `job_runs` table. `cron_logs` is deprecated and removed; never reference it.

## Verifying before deletion

When code *looks* unused, verify before you delete it:

1. `grep -r "<symbol>" web/ src/` — direct imports.
2. `grep -r "<symbol>" web/scripts/` — scripts often call internals that look orphaned.
3. `grep -r "<route-or-symbol>" web/app/api/` — API routes can call helpers via dynamic import.
4. `git log --all -- <path>` — recent activity on the file even if HEAD shows no callers.
5. Check the running app's logs/analytics if available — a feature that fires once per week is easy to miss in a static grep.
6. If still unsure, leave it. Tag the symbol with a TODO and open an issue.

The cost of a wrong delete (silent feature regression) is much higher than the cost of leaving a dead symbol for a sprint.

## Running the AI cost harness

```bash
cd web

# Establish a baseline for a scenario
npx tsx --env-file=.env.local scripts/gemini-compare.ts --scenario=<name> --mode=baseline

# Compare against a prior baseline
npx tsx --env-file=.env.local scripts/gemini-compare.ts --scenario=<name> --mode=compare --baseline=<prior-artifact>
```

Commit the JSON artifact under `web/scripts/artifacts/`. Attach the markdown report to your PR description.

Required for any PR touching `web/lib/ai/**` or `web/lib/analysis/**`.

## Updating the changelog

Edit `web/data/releases.json`:

1. Add a bullet to the current version's `changes` array, **or** create a new version entry if shipping a version bump.
2. Use one of: `"feature"` | `"fix"` | `"improvement"`.
3. One sentence per entry.
4. Bump the version in both `web/package.json` and `web/data/releases.json` if appropriate (patch/minor/major — see root `CLAUDE.md`).

## Editing this repo's docs

The doc-hygiene rule is in root [`CLAUDE.md`](../CLAUDE.md). The short version: **if your PR changes architecture, cron topology, AI model usage, schema, directory layout, scheduler venue, or auth/security model, update the relevant `.md` file in the same PR.** The PR template has a checkbox for each major doc area.
