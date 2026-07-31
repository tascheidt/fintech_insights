# Feedback pipeline

How in-app user feedback travels from the dialog to a shipped change, and the rules that keep each hop honest.

> Companion docs: [`CRON_TOPOLOGY.md`](./CRON_TOPOLOGY.md) (where triage runs), [`AI_HYGIENE.md`](./AI_HYGIENE.md) (model + telemetry rules), [`web/lib/auth/CLAUDE.md`](../web/lib/auth/CLAUDE.md) (route guards).

## Shape

```
FeedbackDialog (UserMenu · RequestCompanyButton)
  └─ POST /api/feedback                       @tascheidt/feedback route factory
       ├─ insert feedback_submissions          (5 user-authored columns only)
       └─ fire-and-forget Resend → admins

       └─ onSubmissionCreated hook → POST /api/internal/feedback/triage
                                              (CRON_SECRET, fire-and-forget)

  triage engine        web/lib/analysis/feedback-triage{,-runner}.ts
       ├─ rubric routed by submission type (defect vs product)
       ├─ trigram-shortlisted duplicate candidates, real UUIDs
       └─ writes triage_* + generated_issue

Admin → /admin → Feedback tab
       ├─ PATCH  /api/admin/feedback           accept · decline · note
       └─ POST   /api/admin/feedback/[id]/generate-code
                                               → workflow_dispatch → auto-implement.yml
```

## Column ownership

`feedback_submissions` is written by three different principals, and the split is
enforced by Postgres column privileges — not by convention, and not by RLS
(which scopes rows, not columns).

| Columns | Written by | Enforcement |
|---|---|---|
| `user_id`, `type`, `title`, `description`, `page_url` | the submitting user | `GRANT INSERT (…) TO authenticated` |
| `status`, `triage_*`, `generated_issue` | the triage engine (service role) | no grant to `authenticated` |
| `status`, `admin_*`, `reviewed_*`, `github_*` | admins, via PATCH | `GRANT UPDATE (…) TO authenticated` + admin RLS policy |

**Why this is load-bearing.** The Supabase anon key ships in the browser bundle,
so any signed-in user can talk to PostgREST directly and skip the route handler
entirely. Before migration `20260731093000`, `authenticated` held table-wide
INSERT on all 24 columns, gated only by `user_id = auth.uid()`. That let a
`viewer`-role account insert:

```json
{ "user_id": "<self>", "status": "accepted", "triage_decision": "yes",
  "triage_confidence": 10, "generated_issue": "<hand-authored markdown>" }
```

— a row that lands in the admin queue already looking AI-vetted, two clicks from
a GitHub issue and from `auto-implement.yml`, which feeds the issue body to a
coding agent running `--dangerously-skip-permissions` with `Bash` enabled. The
grant is what stops a user from authoring the spec an autonomous agent executes.

Rules that follow from this:

- **Never `GRANT INSERT` on `status` or any `triage_*` column.** The POST handler
  deliberately omits `status` so the column default supplies `'submitted'`.
- **Never widen these to table-wide grants** "to fix a permission error." A
  permission error here means code is writing a column it does not own.
- New columns default to nobody: adding one grants nothing until you decide which
  principal owns it and add it to the right `GRANT` list.

## Schema history

The table was created out-of-band in the SQL editor (Feb 2026) and had no
migration for five months, while two later migrations already referenced it —
so `supabase db reset` failed partway through. `20260731090000` is the
retroactive baseline, transcribed from the live database rather than from
`web/packages/feedback/migration/001_feedback_submissions.sql`, which had drifted
(JSONB vs `TEXT[]` labels, differing confidence bounds, and admin RLS policies
that ship commented out in the package but are live and load-bearing here).

## Deploy order

The column grants and the POST handler are coupled: the pre-fix handler sends
`status: 'submitted'` explicitly, which the new grant rejects. Migrations in this
repo are applied manually (`npx tsx web/scripts/run-migration.ts`), so the order
is:

1. Merge + deploy the code.
2. Then apply `20260731093000_feedback_column_grants.sql`.

Reversed, every submission 500s until the deploy lands.

## Triage

### Where it runs, and where it used to

Triage originally lived in a Supabase Edge Function called `triage-feedback`,
invoked by an `AFTER INSERT` trigger via `pg_net`. Its source was not in this
repository — not in git, not in CI, not visible to `gemini-compare.ts` or the
doc-drift check. It was also `verify_jwt: false`, meaning any request on the
internet could invoke it: a POST with any `{record:{id,title,description}}` spent
a Gemini Pro call, and with a known row id it overwrote that row's triage fields
through the service-role client.

It broke, predictably, on 2026-07-31 — see AI_HYGIENE.md, "What pinning a preview
actually cost us". It now runs at `POST /api/internal/feedback/triage` behind
`CRON_SECRET`, called fire-and-forget by `POST /api/feedback`.

### Two rubrics

A bug report and a feature request are different questions, and the old prompt
asked only the feature question — "which product priority does this map to?" —
of both.

- **Defect rubric** (`type` in `DEFECT_TYPES`, currently `bug`): specificity and
  blast radius. Roadmap priority is explicitly irrelevant, and
  `enforceTriagePolicy` rejects a decline whose stated reason invokes priority
  or scope. A bug can still be declined on the merits (intended behaviour,
  unintelligible).
- **Product rubric** (everything else): the prioritization frame, plus the
  existing "unmapped yes becomes maybe" gate.

### Duplicates are links, never verdicts

The old prompt listed candidates numbered `#1..#50` by array index and invited
the model to "classify as NO with reason duplicate". Those ordinals referenced
nothing. Every populated `triage_duplicate_of` in production was the string
`"#2"`.

On 2026-05-25 two users independently reported that the Revolut scraper had
stopped returning roles. Both were declined at confidence 9 and 10 as duplicates
of `#2`, while a *feature request* about the same company was accepted the same
day. The admin table hides accept/decline controls once `status` is `declined`,
so neither report was ever recoverable. A scraper going quietly dark is the exact
failure the weekly drift check exists to catch — these were the product's own
early warning, discarded by its triage.

Three rules now hold, each enforced in code rather than asked of the model:

1. Candidates carry **real UUIDs**; `triage_duplicate_of` is a UUID column with a
   self-referencing FK.
2. A returned id is **dropped unless it was in the candidate set**
   (`sanitizeDuplicate`) — a hallucinated or positional reference stores nothing.
3. A duplicate link **never by itself produces a decline** — a `no` accompanied by
   a duplicate link is rewritten to `maybe`, with the link preserved. Two people
   reporting the same outage is corroboration, not redundancy.

Candidates are shortlisted by trigram similarity (`feedback_duplicate_candidates`)
over **all** prior submissions including declined ones. The old query filtered to
`triage_decision IN ('yes','maybe')`, so a rejected idea was re-judged from
scratch each time with no memory of having been rejected.

### Replaying history

`web/scripts/triage-feedback.ts --replay --dry-run` re-judges stored submissions
against the current engine and prints every verdict that changed. With
`--fixture=web/scripts/fixtures/feedback-history.json` it needs only
`GEMINI_API_KEY` — no Supabase credentials — so a prompt or policy change can be
regression-tested anywhere. Regenerate the fixture with
`web/scripts/dump-feedback-fixture.ts`.

The pure policy functions are unit-tested in `feedback-triage.test.ts`, including
the Revolut case as an explicit regression.

### Failure handling

Failures write to `triage_error`, never `triage_reasoning`. The old handler wrote
`Triage error: <raw Gemini message>` into `triage_reasoning`, which
`FeedbackHistory` renders straight to the submitting user — that is how a Gemini
404 became user-facing copy. `triage_reasoning` is admin-facing prose and must
stay off user surfaces.

A row that started triage but never finished keeps `status='reviewing'` with
`triage_attempted_at` set and `triage_completed_at` null. That is the retry
signal; re-run with `--id=<uuid> --write`.
