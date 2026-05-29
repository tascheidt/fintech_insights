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

## Jobs page search

The `/jobs` search box (`?q=` URL param) is server-side full-text search. [getJobsListData()](../web/lib/dashboard-queries.ts) matches against the `search_tsv` generated `tsvector` column on `job_postings` (title = weight A, location = B, description_text = C), GIN-indexed via `idx_job_postings_search_tsv` (migration `20260528120000_jobs_search_tsvector.sql`). It uses `tsvector @@ to_tsquery` rather than trigram ILIKE because ILIKE on long description text forces a bitmap-heap recheck against every candidate's full body (~1.3s for a broad term on the incumbent corpus); the `@@` match reads pre-lexemed tokens straight from the index (~10ms for the same query) and scales as the corpus grows.

`buildSearchTsQuery` parses a small, Google-like query syntax into a `tsquery` (keep it in sync with the `SearchHelpPopover` examples):
- `staff engineer` → `staff:* & engineer:*` — all words (AND), each prefix-matched so search-as-you-type works.
- `"staff engineer"` → `(staff <-> engineer)` — exact phrase (adjacent, in order). An unterminated quote mid-type (`"staff eng`) keeps the last word as a prefix: `(staff <-> eng:*)`.
- `engineer -contract` → `engineer:* & !contract:*` — leading `-` excludes a term (or a quoted phrase: `-"data entry"`).

We construct every tsquery operator (`:*`, `&`, `<->`, `!`) ourselves and feed `to_tsquery` only sanitized alnum lexemes (NFKC; non-alnum stripped per token; 120-char / 12-group caps), so users cannot inject tsquery syntax or break the parse. There is no 3-char floor — short prefixes work. Company-name search is covered incidentally because most JD bodies mention the company; the Company dropdown owns precise company filtering.

`search_tsv` is a STORED generated column, so it is auto-maintained — do **not** add a trigger that writes to it (a BEFORE trigger assigning a generated column errors and breaks ingest).

When a search is active the row cap lifts from 500 → 1000; if the cap is hit the function returns `truncated: true` and JobsPageClient renders a banner inviting the user to refine. Every search emits a `jobs.search` log event with `ts_query`, `result_count`, `truncated`, `duration_ms` — the canary for graduating to keyset pagination / `ts_rank` relevance ordering later.

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

## Tests

Two test layers, kept deliberately small.

### Unit (Vitest)

```bash
cd web
npm test          # one-shot run, used by CI
npm run test:watch
```

Six colocated `*.test.ts` files cover the highest-leverage pure functions: the `description_hash` gate in [`web/lib/jobs/processor.ts`](../web/lib/jobs/processor.ts), the digest input builder in [`web/lib/analysis/digest.ts`](../web/lib/analysis/digest.ts), the AI model resolver in [`web/lib/ai/prompt-config.ts`](../web/lib/ai/prompt-config.ts), the env validator in [`web/lib/env.ts`](../web/lib/env.ts), the voice heuristic in [`web/lib/ai/voice-validator.ts`](../web/lib/ai/voice-validator.ts), and the admin-feedback Zod schema in [`web/packages/feedback/src/validation.ts`](../web/packages/feedback/src/validation.ts).

**Philosophy:** regression protection on pure functions, not coverage chase. Cron handlers are mock-heavy and low ROI — we test the helpers they consume, not the routes themselves. Per the CLAUDE.md anti-pattern list, we don't mock the Supabase DB schema in tests; the Supabase mocks here only stand in for the client object so a unit test can run hermetically against a single function. Anything more substantial belongs in production telemetry, not unit tests.

When adding a new test, ask: is this function pure, deterministic, and high-leverage (cost regression, security boundary, output contract)? If yes, add it. If no, add telemetry.

### E2E (Playwright)

```bash
cd web
npm run e2e
```

Single smoke test at [`web/e2e/smoke.spec.ts`](../web/e2e/smoke.spec.ts): loads `/login` and asserts the Google OAuth button is visible.

**Reduction from the original plan.** The launch plan called for a "homepage -> digest -> admin trigger" flow. We reduced it to "login page renders" because:

1. The dashboard, digest, and admin routes are all auth-gated by `web/proxy.ts` — driving them needs a working OAuth round-trip in CI.
2. The digest page expects real `weekly_digests` rows; admin trigger expects an admin user. Both require seeded DB state.
3. A broken login page would be a fully-broken deploy, so the canary still has signal. We accept that a regression in (e.g.) the digest page would only be caught by production telemetry, not e2e — that tradeoff is documented here so the next person knows where the gap is.

When auth/DB fixtures are available, expand the smoke spec to cover the originally-planned flow.

### CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs lint (non-blocking), `tsc --noEmit`, `npm test`, and `npm run build` on every PR + push to main. The Playwright smoke runs only on push to main (it needs a built+booted app). The build step uses minimum-viable real-looking stubs (e.g. `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`) so [`web/lib/env.ts`](../web/lib/env.ts) accepts them; if the validator gets stricter, that env list will need updates.

The migration filename check in CI is a pragmatic substitute for `supabase db diff` until we have a configured Supabase project — same posture as `doc-drift-check.yml` (warn, don't block).

## Editing this repo's docs

The doc-hygiene rule is in root [`CLAUDE.md`](../CLAUDE.md). The short version: **if your PR changes architecture, cron topology, AI model usage, schema, directory layout, scheduler venue, or auth/security model, update the relevant `.md` file in the same PR.** The PR template has a checkbox for each major doc area.
