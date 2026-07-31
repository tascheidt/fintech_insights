# Shared search reports

A user runs a search on `/jobs`, clicks **Generate report**, and gets a
point-in-time artifact they can send to someone: an AI synthesis of the role
types in the result set, a table of the matching roles, and an optional note.
The recipient reads it at `/r/[token]` **without an account**.

This is the only surface in the product that renders to an unauthenticated
visitor, so most of what follows is about why that is safe.

## Flow

```
/jobs (search)
  → "Generate report"        components/reports/SearchReportModal.tsx
  → POST /api/reports        re-reads the ids server-side, builds the snapshot,
                             calls Gemini once (Flash, ungrounded), persists
  → share link + email       PATCH /api/reports/[id]
                             POST  /api/reports/[id]/send  (Resend)
  → /r/[token]               app/(public)/r/[token]/page.tsx — public
```

## Why the snapshot

`shared_search_reports.jobs_snapshot` denormalizes the visible result rows at
generation time. Two reasons, both load-bearing:

1. **A sent artifact must not drift.** The recipient has to see what the sender
   saw. A live query would silently change as roles close, get re-categorized,
   or their company is deactivated.
2. **No live read path for an anonymous visitor.** The public page renders only
   the report's own row. It never queries `job_postings` or `companies`, so
   there is nothing to widen, enumerate, or filter-bypass.

`MAX_REPORT_JOBS` (100) caps the snapshot so the JSONB stays tens of KB. Past
that the honest answer is the CSV export, not a longer report. Expired rows are
deleted by `pruneJobRunRetention` on the daily collect cron — an unbounded table
of snapshots is the same storage shape that put the DB over quota in June 2026.

## Why there is no anon RLS policy

The table has RLS enabled with **owner-scoped policies only**. Public reads go
through the service-role client (`lib/reports/store.ts`) behind an exact
`share_token` match plus explicit `revoked_at` / `expires_at` checks.

Granting `anon` SELECT would make every report enumerable by anyone with the
publishable key — a token-scoped policy cannot express "only the row whose token
you already knew". The token IS the capability: 18 random bytes (144 bits) from
`lib/reports/share-token.ts`, minted server-side.

Because the admin client bypasses RLS, **every owner-scoped call in the store
writes the ownership check into the query** (`created_by = ownerId`). A non-owner
gets a 404, not a 403, so report ids aren't probeable.

## The auth boundary

`web/proxy.ts` gates everything except `PUBLIC_PATHS` and, now, the
`PUBLIC_PREFIXES` list — currently just `/r/`. A new prefix there is a hole in
the auth boundary and needs the same two properties as this one: the capability
is in the URL, and the page issues no live queries.

The report page is deliberately *not* under `(marketing)`: marketing pages are
indexable, capability URLs must not be. `generateMetadata` sets
`robots: { index: false, follow: false }` on every variant, including the
not-found path.

## The gate

The report itself is fully readable — that is the point. Everything *deeper*
requires sign-in:

- job titles link to `/jobs/[id]`, which the proxy redirects to
  `/login?next=/jobs/[id]` and returns to after auth;
- a "Go deeper" panel spells out what signing in adds;
- the email deliberately does **not** link job titles, because an
  unauthenticated recipient clicking a row inside an email would land on a login
  screen with no explanation. The email's single CTA is the public report.

## The AI call

`lib/analysis/search-report.ts` — `generateSearchReportSynthesis`.

- **Flash, ungrounded.** The postings are the evidence; grounding would add cost
  and a hallucination surface for nothing.
- One call per report. Telemetered to `gemini_usage_events` on both the ok and
  error paths (`callSite: "generateSearchReportSynthesis"`).
- User-facing → the voice directive applies (`getVoiceDirective("narrative")`).
- **Failure is non-fatal by contract.** It returns `null` and the report renders
  table-only. A shared link that 500s because Flash hiccuped is worse than a
  report without a summary.
- The prompt samples up to `MAX_SYNTHESIS_JOBS` (40) rows round-robin across
  companies (`sampleJobsForSynthesis`) so one high-volume employer can't skew
  the clusters toward its own titles.
- Description bodies are loaded separately (`loadSynthesisInputs`) through
  `active_job_postings` — the snapshot carries only what the table renders.

## Server-side scoping

`POST /api/reports` does not trust the client's row data. It takes ids only and
re-reads them itself, because the result is published to people without
accounts. Enforced there:

- reads go through `active_job_postings`, so a deactivated company cannot be
  published (CLAUDE.md §7);
- incumbent-tier rows are dropped when `incumbent_tracking_enabled` is off,
  matching what the Jobs page would have shown;
- the function-group label in the search context is validated against
  `CATEGORY_GROUPS` rather than echoed back as free text.

Client ordering is preserved (semantic relevance, or the user's chosen sort) so
the report reads in the order the sender saw.

## Email

`lib/email/templates/search-report.tsx`, sent via Resend with the same
`retryResendCall` wrapper as the weekly digest. `POST /api/reports/[id]/send` is
the one place a signed-in user can cause mail to reach an address of their
choosing, so it is narrow by design: owner-only, at most
`MAX_REPORT_RECIPIENTS` (10) per call, and the body is entirely server-rendered
from the stored report — the request carries no HTML, no subject, and no
free-form sender identity. `replyTo` is the sender's own account email.

## Files

| Path | Role |
|---|---|
| `web/lib/reports/types.ts` | Shared types + pure helpers (caps, provenance line, title, sampling). Imported by client, routes, email, public page. |
| `web/lib/reports/share-token.ts` | Token minting + shape check. Server-only. |
| `web/lib/reports/store.ts` | Persistence. Service-role; owner checks written into the queries. |
| `web/lib/analysis/search-report.ts` | The Gemini synthesis. |
| `web/app/api/reports/route.ts` | Create. |
| `web/app/api/reports/[id]/route.ts` | Edit title / note. |
| `web/app/api/reports/[id]/send/route.ts` | Email it. |
| `web/app/(public)/r/[token]/page.tsx` | The public report. |
| `web/components/reports/SearchReportModal.tsx` | Generate + share dialog. |
| `web/lib/email/templates/search-report.tsx` | The email. |
| `web/supabase/migrations/20260731000000_shared_search_reports.sql` | Table, RLS, view counter. |
