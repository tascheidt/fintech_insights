# Feedback pipeline

How in-app user feedback travels from the dialog to a shipped change, and the rules that keep each hop honest.

> Companion docs: [`CRON_TOPOLOGY.md`](./CRON_TOPOLOGY.md) (where triage runs), [`AI_HYGIENE.md`](./AI_HYGIENE.md) (model + telemetry rules), [`web/lib/auth/CLAUDE.md`](../web/lib/auth/CLAUDE.md) (route guards).

## Shape

```
FeedbackDialog (UserMenu · RequestCompanyButton)
  └─ POST /api/feedback                       @tascheidt/feedback route factory
       ├─ insert feedback_submissions          (5 user-authored columns only)
       └─ fire-and-forget Resend → admins

  DB trigger feedback_triage_webhook → pg_net →

  triage engine                                (see CRON_TOPOLOGY.md)
       ├─ rubric routed by submission type
       ├─ embedding-based duplicate detection
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
