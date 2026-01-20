# Weekly Digest TLDR-Style Redesign

**Overall Progress:** `100%` (Implementation complete)

## TLDR
Restyle weekly digests (email + web) with Wealthsimple TLDR's punchy voice and clean visuals. AI generates catchy headlines, templates get a minimal redesign. **Now with database persistence for web UI display.**

## Critical Decisions
- **Content-first approach**: Update AI prompts first since they generate the punchy headlines that drive the redesign
- **Shared headline field**: Add `headline` to insight data structure used by both email and web
- **No branding copy**: Adopt voice/style philosophy only, not TLDR colors or logos
- **Database persistence**: Store digests in `weekly_digests` table for web UI display

---

## Tasks

- [x] 🟩 **Step 1: Update AI Prompts for Punchy Voice**
  - [x] 🟩 Add `headline` field to analysis output schema in `advanced-strategic.ts`
  - [x] 🟩 Update system prompt to generate emoji-forward, conversational headlines
  - [x] 🟩 Adjust executive summary prompt for casual, plain-language tone

- [x] 🟩 **Step 2: Update Data Structures**
  - [x] 🟩 Add `headline` field handling in `src/reports/generator.py`
  - [x] 🟩 Update `DigestInsight` interface in `WeeklyDigestsList.tsx` to include headline

- [x] 🟩 **Step 3: Redesign Email Template**
  - [x] 🟩 Replace gradient header with clean, minimal header
  - [x] 🟩 Simplify stat boxes into inline summary line
  - [x] 🟩 Update insight cards to show punchy headlines
  - [x] 🟩 Add conversational footer copy

- [x] 🟩 **Step 4: Update Web Component**
  - [x] 🟩 Display headline instead of company name as primary text
  - [x] 🟩 Match email's clean visual style
  - [x] 🟩 Ensure emoji renders correctly

- [x] 🟩 **Step 5: Database Persistence (NEW)**
  - [x] 🟩 Create `weekly_digests` table migration (`20260122000000_weekly_digests.sql`)
  - [x] 🟩 Create `weekly_digest_companies` junction table for company summaries
  - [x] 🟩 Update cron job to save digests to database
  - [x] 🟩 Update dashboard to pull from `weekly_digests` table

- [x] 🟩 **Step 6: Test & Validate**
  - [x] 🟩 TypeScript compiles without errors
  - [x] 🟩 No lint errors in modified files
  - [ ] 🟨 Run migration on database (manual step)
  - [ ] 🟨 Generate test digest (trigger via admin or cron)

---

## How to Complete Setup

1. **Run the migration** on your Supabase database:
   ```bash
   npx tsx web/scripts/run-migration.ts
   ```

2. **Trigger a test digest** (as admin):
   ```bash
   curl -X POST http://localhost:3000/api/admin/trigger \
     -H "Content-Type: application/json" \
     -d '{"job_type": "report"}'
   ```

3. **Verify in the dashboard** that TLDR headlines appear
