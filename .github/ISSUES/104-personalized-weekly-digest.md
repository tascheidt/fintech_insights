# 104 – Personalized Weekly Digest (Company-Filtered)

## TL;DR

Give users the ability to create a personalized weekly digest that focuses only on companies they select. Instead of receiving the full digest for all tracked companies, users can choose a subset of companies and receive a tailored digest with insights only for those companies.

## Current vs Expected

| Current | Expected |
|--------|----------|
| Digest includes all tracked companies (or all in user's org). | Users can select which companies they want in their digest. |
| Single digest content, same for all recipients. | Per-user digest content filtered by company selection. |
| No UI for managing digest preferences. | UI to select/deselect companies for digest inclusion. |

## Key Requirements

### 1. Company Selection Storage
- Store user's company selection for digest (e.g., `digest_company_ids` on profiles or new `user_digest_preferences` table).
- Support "all companies" (default) vs. explicit company list.
- RLS: Users can only select companies they have access to (within their org).

### 2. Digest Generation Pipeline
- When generating digest for a user, filter `weekly_digest_companies` (or equivalent) to only include companies in the user's selection.
- Reuse existing AI commentary and aggregation logic; apply company filter before/after.
- Fallback: If no companies selected, treat as "all companies" or skip sending.

### 3. Settings UI
- Add a settings page or section for "Digest Preferences" or "Weekly Digest".
- Company multi-select (or checkbox list) for users to choose which companies to include.
- Save preferences to database; reflect in next digest run.

### 4. Multi-User Distribution Integration
- Current system sends one digest to many users; each user may have different company selections.
- Either: generate one digest per user (expensive) or: generate full digest once, then filter per-user when sending (more efficient).
- Recommendation: Generate full digest once; filter content per-user when rendering/sending email.

## Relevant Files

- `web/app/api/cron/report/route.ts` – Digest generation and email sending; add per-user filtering.
- `web/lib/analysis/digest.ts` – Content generation; may need to support company filter.
- `web/lib/email/templates/weekly-digest.tsx` – Email template; pass filtered company list.
- `profiles` table / `user_email_preferences` – Add company selection (e.g., `digest_company_ids UUID[]` or JSONB).
- `web/supabase/migrations/` – New migration for user digest preferences.
- New: `web/app/(dashboard)/settings/digest/page.tsx` (or similar) – Digest preferences UI.

## Open Questions

- **Storage:** Add `digest_company_ids` to `profiles` vs. new `user_digest_preferences` table?
- **Default:** If user has never set preferences, use "all companies" or prompt them to select?
- **Performance:** For N users with different selections, generate N filtered digests from one base digest vs. N full AI runs?

## Labels

- **Type:** feature
- **Priority:** normal
- **Effort:** medium–large
