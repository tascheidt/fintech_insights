# Weekly Digest Email System - Technical Architecture Overview

**Document Purpose:** Fact-based technical overview of current weekly digest email implementation for designing user-based email distribution system.

**Last Updated:** January 2025

---

## Executive Summary

The weekly digest email system currently sends a single email to one recipient configured via environment variable. The system generates AI-powered TLDR-style content, persists it to the database, and sends via Resend API. This document outlines the current architecture, constraints, and requirements for transitioning to a user-based distribution model.

---

## 1. Current Email Delivery Architecture

### 1.1 Execution Flow

**Schedule:** Weekly on Monday at 8:00 AM UTC  
**Trigger:** Vercel Cron Job → `GET /api/cron/report`  
**Authentication:** Bearer token (`CRON_SECRET` environment variable)  
**Location:** `web/app/api/cron/report/route.ts`

### 1.2 Email Sending Implementation

**Current Code (lines 210-236):**
```typescript
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fintech-insights.vercel.app";
const to = process.env.REPORT_EMAIL || process.env.ADMIN_EMAIL;
const from = process.env.RESEND_FROM || "onboarding@resend.dev";
const resendKey = process.env.RESEND_API_KEY;

let emailSent = false;
if (resendKey && to) {
  try {
    const resend = new Resend(resendKey);
    
    await resend.emails.send({
      from,
      to,  // Single email address (string)
      subject: `Fintech Insights TLDR – ${format(new Date(), "MMM d, yyyy")}`,
      react: WeeklyDigestEmail({ digest, appUrl }),
    });
    
    emailSent = true;
    console.log(`Weekly digest email sent to ${to}`);
  } catch (e) {
    console.error("Resend error:", e);
    // Don't fail the whole job if email fails - still save to DB
  }
}
```

**Key Facts:**
- Single recipient: `to` is a string, not an array
- Environment variable: `REPORT_EMAIL` or fallback to `ADMIN_EMAIL`
- Error handling: Email failures don't block digest generation or database persistence
- Template: React Email component (`WeeklyDigestEmail`) renders HTML

---

## 2. Database Schema

### 2.1 User/Profile Schema

**Table:** `profiles`  
**Location:** `web/supabase/migrations/20260117000000_initial_schema.sql`

```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Facts:**
- Email stored in `email` field (TEXT, NOT NULL)
- Multi-tenant: Users belong to `organization_id`
- Roles: `viewer`, `editor`, `admin`
- RLS enabled: Users can only see their own profile
- Admin client bypasses RLS: `createAdminClient()` uses service role key

### 2.2 Weekly Digest Storage Schema

**Table:** `weekly_digests`  
**Location:** `web/supabase/migrations/20260122000000_weekly_digests.sql`

```sql
CREATE TABLE weekly_digests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    week_start TIMESTAMPTZ NOT NULL,
    week_end TIMESTAMPTZ NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    total_jobs INTEGER NOT NULL DEFAULT 0,
    total_companies INTEGER NOT NULL DEFAULT 0,
    
    -- Email delivery tracking (CURRENT LIMITATION)
    email_sent BOOLEAN DEFAULT FALSE,
    email_recipient TEXT,  -- Single recipient string
    email_sent_at TIMESTAMPTZ,
    
    UNIQUE(week_start, week_end)
);
```

**Current Limitations:**
- `email_recipient` is TEXT (single string), not array
- No tracking of individual user deliveries
- No per-user email preferences
- No unsubscribe mechanism

### 2.3 Company Summaries Schema

**Table:** `weekly_digest_companies`  
**Junction table storing company-level summaries within each digest**

```sql
CREATE TABLE weekly_digest_companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    digest_id UUID REFERENCES weekly_digests(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    headline TEXT NOT NULL,
    body TEXT NOT NULL,
    new_job_count INTEGER NOT NULL DEFAULT 0,
    departments JSONB DEFAULT '{}',
    dominant_tech JSONB DEFAULT '[]',
    seniority_breakdown JSONB DEFAULT '{}',
    job_ids JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(digest_id, company_id)
);
```

---

## 3. Email Service Provider: Resend API

### 3.1 Current Configuration

**Provider:** Resend  
**API Library:** `resend` npm package  
**Authentication:** `RESEND_API_KEY` environment variable  
**From Address:** `RESEND_FROM` environment variable (defaults to `onboarding@resend.dev`)

### 3.2 Resend API Capabilities

**Documentation:** [Resend API Docs](https://resend.com/docs/api-reference/emails/send-email)

**Supported Recipient Formats:**
- Single recipient: `to: "email@example.com"`
- Multiple recipients: `to: ["email1@example.com", "email2@example.com"]`
- BCC support: `bcc: ["email@example.com"]`

**Rate Limits:**
- **Free Tier:** 3,000 emails/month, 100 emails/day
- **Pro Tier:** $20/month for 50,000 emails/month
- **Enterprise:** Custom pricing

**Current Usage:**
- Single email per digest
- No rate limit concerns with current implementation

---

## 4. Content Generation Pipeline

### 4.1 Digest Generation Flow

1. **Data Collection** (`getWeeklyData(7)`):
   - Fetches job postings from last 7 days
   - Groups by company
   - Filters: `is_active = true`, `first_seen_date >= cutoff`

2. **AI Commentary Generation** (`generateWeeklyReport`):
   - Uses Gemini 3 Pro (falls back to Flash on quota errors)
   - Generates TLDR-style headlines and body text per company
   - Processes companies in parallel batches (default: 3 concurrent)
   - Temperature: 0.7 (creative output)

3. **Aggregation:**
   - Calculates totals (jobs, companies)
   - Sorts by job count (descending)
   - Builds department/tech/seniority breakdowns

**Location:** `web/lib/analysis/digest.ts`

### 4.2 Email Template

**Component:** `WeeklyDigestEmail`  
**Location:** `web/lib/email/templates/weekly-digest.tsx`  
**Format:** React Email (renders to HTML)  
**Content:** TLDR-style design with company summaries, stats, and dashboard links

---

## 5. Current Limitations & Constraints

### 5.1 Email Distribution

- ✅ **Single recipient only** - Environment variable configuration
- ❌ **No user-based distribution** - Cannot send to multiple users
- ❌ **No email preferences** - No opt-in/opt-out mechanism
- ❌ **No delivery tracking** - Cannot track which users received emails
- ❌ **No organization filtering** - Cannot filter by organization_id

### 5.2 Database Schema

- ❌ **No user email preferences table** - No way to store opt-in/opt-out
- ❌ **No delivery tracking table** - Cannot track per-user delivery status
- ❌ **Limited recipient storage** - `email_recipient` is TEXT, not array

### 5.3 Error Handling

- ✅ **Graceful degradation** - Email failures don't block digest generation
- ❌ **No retry mechanism** - Failed emails are not retried
- ❌ **No partial failure tracking** - If sending to multiple users fails, no granular tracking

---

## 6. Technical Requirements for User-Based Distribution

### 6.1 Database Changes Required

**Option A: Add email preferences to profiles table**
```sql
ALTER TABLE profiles ADD COLUMN email_preferences JSONB DEFAULT '{"weekly_digest": true}';
```

**Option B: Create separate email preferences table**
```sql
CREATE TABLE user_email_preferences (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    weekly_digest_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Option C: Create delivery tracking table**
```sql
CREATE TABLE weekly_digest_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    digest_id UUID REFERENCES weekly_digests(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    email_address TEXT NOT NULL,
    sent_at TIMESTAMPTZ,
    status TEXT CHECK (status IN ('sent', 'failed', 'bounced')),
    error_message TEXT,
    UNIQUE(digest_id, user_id)
);
```

### 6.2 Code Changes Required

**Current:** Single recipient from environment variable  
**Required:** Query users from `profiles` table using admin client

```typescript
// Pseudo-code for user-based distribution
const supabase = createAdminClient();
const { data: users } = await supabase
  .from("profiles")
  .select("id, email, email_preferences")
  .eq("email_preferences->weekly_digest", true); // If preferences exist

const recipients = users.map(u => u.email);
```

**Resend API Changes:**
- Change `to` from string to array: `to: recipients`
- Or send individually for better tracking: Loop through users and send separately

### 6.3 Rate Limiting Considerations

**Current:** 1 email per digest (no rate limit concerns)  
**Future:** N emails per digest (where N = number of users)

**Constraints:**
- Resend free tier: 100 emails/day
- If user count > 100: Need batching or Pro tier upgrade
- Batch strategy: Send in chunks over multiple days, or upgrade plan

**Batching Example:**
```typescript
// Send in batches of 100
const batchSize = 100;
for (let i = 0; i < recipients.length; i += batchSize) {
  const batch = recipients.slice(i, i + batchSize);
  await resend.emails.send({ to: batch, ... });
  // Wait if needed to avoid rate limits
}
```

### 6.4 Multi-Tenancy Considerations

**Current:** Single email, no organization filtering  
**Future:** May need to filter by organization

**Questions:**
- Send to all users across all organizations?
- Or filter by organization (e.g., only users in same org as companies)?
- Current RLS: Users only see companies in their organization

**Code Example:**
```typescript
// Option: Send to all users
const { data: users } = await supabase
  .from("profiles")
  .select("email");

// Option: Filter by organization
const { data: users } = await supabase
  .from("profiles")
  .select("email")
  .eq("organization_id", specificOrgId);
```

---

## 7. Error Handling & Monitoring

### 7.1 Current Error Handling

- Email failures logged but don't block digest generation
- Database persistence continues even if email fails
- Cron log tracks success/failure status

### 7.2 Required for Multi-User Distribution

**Partial Failure Handling:**
- Track which users received emails successfully
- Retry failed deliveries
- Log individual failures vs. batch failures

**Monitoring:**
- Track delivery rates per digest
- Alert on high failure rates
- Monitor rate limit usage

---

## 8. Security & Privacy Considerations

### 8.1 Current Implementation

- Single recipient: No privacy concerns (one-to-one)
- Email content: Same for all recipients

### 8.2 Multi-User Distribution Concerns

**Privacy:**
- **BCC vs. Individual Sends:** BCC hides recipient list but less trackable
- **Individual Sends:** Better tracking but exposes email addresses if misconfigured

**Recommendation:** Use individual sends with proper error handling for better tracking and privacy

**Data Access:**
- Admin client bypasses RLS (required for cron job)
- Only queries `email` field (no sensitive data exposure)
- Email addresses are already stored in profiles table

---

## 9. Migration Path Considerations

### 9.1 Backward Compatibility

**Options:**
1. **Replace entirely:** Remove `REPORT_EMAIL` env var, always use user-based
2. **Hybrid approach:** Use `REPORT_EMAIL` as fallback if no users found
3. **Feature flag:** Add environment variable to toggle between modes

**Recommendation:** Hybrid approach for gradual migration

### 9.2 Rollout Strategy

1. **Phase 1:** Add email preferences to profiles (default: enabled)
2. **Phase 2:** Update code to query users and send to array
3. **Phase 3:** Add delivery tracking table
4. **Phase 4:** Add retry mechanism for failed deliveries
5. **Phase 5:** Remove `REPORT_EMAIL` env var dependency

---

## 10. Performance Considerations

### 10.1 Current Performance

- Single email: ~1-2 seconds
- Total cron job: ~300 seconds max duration (5 minutes)
- AI generation: Most time-consuming part (parallel processing helps)

### 10.2 Multi-User Distribution Impact

**Email Sending:**
- Resend API: ~100-200ms per email
- 100 users: ~10-20 seconds
- 1000 users: ~100-200 seconds (may exceed cron timeout)

**Database Queries:**
- User query: <100ms for typical user counts
- Delivery tracking inserts: Batch inserts recommended

**Recommendation:** Monitor cron job duration, may need to increase `maxDuration` or implement async processing

---

## 11. Cost Implications

### 11.1 Current Costs

- Resend free tier: 3,000 emails/month
- Current usage: ~4 emails/month (1 per week)
- Cost: $0

### 11.2 Projected Costs (User-Based)

**Assumptions:**
- 50 users: 200 emails/month (50 users × 4 weeks) = Free tier
- 100 users: 400 emails/month = Free tier
- 500 users: 2,000 emails/month = Free tier
- 1,000 users: 4,000 emails/month = Pro tier ($20/month)

**Recommendation:** Monitor user growth and plan for Pro tier upgrade when approaching 3,000 emails/month

---

## 12. Summary of Required Changes

### 12.1 Database Schema

- [ ] Add email preferences column/table
- [ ] Add delivery tracking table (optional but recommended)
- [ ] Update `weekly_digests.email_recipient` to support multiple recipients (or deprecate)

### 12.2 Code Changes

- [ ] Update `web/app/api/cron/report/route.ts` to query users from `profiles`
- [ ] Implement user filtering (preferences, organization, etc.)
- [ ] Update Resend API call to use array of recipients
- [ ] Add delivery tracking (insert into tracking table)
- [ ] Implement error handling for partial failures
- [ ] Add retry mechanism (optional)

### 12.3 Configuration

- [ ] Decide on email preferences default (opt-in vs. opt-out)
- [ ] Plan rate limiting strategy (batching vs. upgrade)
- [ ] Set up monitoring/alerting for delivery rates

### 12.4 Testing

- [ ] Test with small user set (< 10 users)
- [ ] Test with larger user set (100+ users)
- [ ] Test error scenarios (invalid emails, rate limits)
- [ ] Test multi-tenant scenarios (organization filtering)

---

## 13. Open Questions for CTO Decision

1. **User Filtering:** Send to all users or filter by organization/role?
2. **Email Preferences:** Opt-in (default false) or opt-out (default true)?
3. **Delivery Method:** Array send or individual sends for better tracking?
4. **Rate Limiting:** Batch sends or upgrade Resend plan?
5. **Backward Compatibility:** Keep `REPORT_EMAIL` as fallback or remove?
6. **Delivery Tracking:** Full tracking table or simple count?
7. **Error Handling:** Retry failed deliveries or log and move on?
8. **Privacy:** BCC or individual sends?

---

## Appendix: Key Files Reference

- **Cron Job:** `web/app/api/cron/report/route.ts`
- **Digest Generation:** `web/lib/analysis/digest.ts`
- **Email Template:** `web/lib/email/templates/weekly-digest.tsx`
- **Admin Client:** `web/lib/supabase/admin.ts`
- **Database Schema:** `web/supabase/migrations/20260117000000_initial_schema.sql`
- **Digest Schema:** `web/supabase/migrations/20260122000000_weekly_digests.sql`
- **Vercel Config:** `web/vercel.json` (cron schedule)

---

**Document Status:** Ready for CTO review and architectural decision-making.
