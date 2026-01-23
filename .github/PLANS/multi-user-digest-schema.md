# Multi-User Email Digest Schema Migration

**Overall Progress:** `0%`

## TLDR
Update database schema to support multi-user weekly digest email distribution. Add email preferences to profiles table and create delivery tracking table to monitor which users received each digest.

## Critical Decisions
- **Email Preferences Storage:** JSONB column in `profiles` table (simpler than separate table, flexible for future preferences)
- **Default Opt-In:** `weekly_digest: true` by default (opt-out model - all users receive emails unless they disable)
- **Delivery Tracking:** Separate `weekly_digest_deliveries` table (enables audit trail, retry logic, and delivery analytics)
- **RLS Policy:** Users can only view their own delivery records (privacy protection)

## Tasks

- [ ] 🟥 **Step 1: Create Migration File**
  - [ ] 🟥 Create `web/supabase/migrations/20260124000000_multi_user_digest.sql`
  - [ ] 🟥 Add migration header comments

- [ ] 🟥 **Step 2: Add Email Preferences to Profiles Table**
  - [ ] 🟥 Add `email_preferences` JSONB column to `profiles` table
  - [ ] 🟥 Set default value: `'{"weekly_digest": true}'::jsonb`
  - [ ] 🟥 Add column comment explaining the schema structure
  - [ ] 🟥 Backfill existing users with default preferences

- [ ] 🟥 **Step 3: Create Weekly Digest Deliveries Table**
  - [ ] 🟥 Create `weekly_digest_deliveries` table with required columns:
    - `id` (UUID, PRIMARY KEY, DEFAULT uuid_generate_v4())
    - `digest_id` (UUID, FOREIGN KEY -> weekly_digests.id, ON DELETE CASCADE)
    - `user_id` (UUID, FOREIGN KEY -> profiles.id, ON DELETE CASCADE)
    - `email` (TEXT, NOT NULL) - Snapshot of email address at send time
    - `status` (TEXT, NOT NULL, CHECK constraint: 'sent' or 'failed')
    - `sent_at` (TIMESTAMPTZ, DEFAULT NOW())
    - `error_message` (TEXT, NULLABLE)
  - [ ] 🟥 Add UNIQUE constraint on (digest_id, user_id) to prevent duplicates
  - [ ] 🟥 Add table comment explaining purpose

- [ ] 🟥 **Step 4: Add Indexes for Performance**
  - [ ] 🟥 Create index on `weekly_digest_deliveries(digest_id)` for digest lookups
  - [ ] 🟥 Create index on `weekly_digest_deliveries(user_id)` for user delivery history
  - [ ] 🟥 Create index on `weekly_digest_deliveries(status)` for filtering failed deliveries

- [ ] 🟥 **Step 5: Enable Row Level Security**
  - [ ] 🟥 Enable RLS on `weekly_digest_deliveries` table
  - [ ] 🟥 Create SELECT policy: "Users can view their own delivery records"
    - Policy uses `user_id = auth.uid()` condition
  - [ ] 🟥 Note: Service role bypasses RLS for cron job inserts (no explicit INSERT policy needed)

- [ ] 🟥 **Step 6: Verify Migration**
  - [ ] 🟥 Test migration runs without errors
  - [ ] 🟥 Verify column exists in `profiles` table
  - [ ] 🟥 Verify `weekly_digest_deliveries` table created correctly
  - [ ] 🟥 Verify RLS policies work (users can only see their own records)
  - [ ] 🟥 Verify indexes are created
