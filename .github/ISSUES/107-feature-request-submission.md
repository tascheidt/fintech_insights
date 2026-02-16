# 107 – Feature Request Submission System

## TL;DR

Add a first-class feature request submission capability accessible from the main navigation menu. Users can submit, view, and track feature requests. UX design (agent) should review optimal visual placement and interaction patterns in the navigation bar.

## Current vs Expected

| Current | Expected |
|---------|----------|
| No way for users to submit feature requests in-app. | Prominent "Feature Requests" or "Feedback" entry point in main navigation menu. |
| Feature requests likely handled via email or external channels. | In-app submission form with title, description, category, and optional voting/status tracking. |
| Navigation menu has: Dashboard, Jobs, Companies, Weekly Digests, Admin. | Navigation includes feature requests as a first-class menu item (placement TBD by UX review). |

## Key Requirements

### 1. Database schema
- **New table:** `feature_requests`
  - `id` (UUID, PK)
  - `user_id` (UUID, FK → profiles)
  - `title` (TEXT)
  - `description` (TEXT)
  - `category` (TEXT) - e.g., "dashboard", "jobs", "companies", "digests", "other"
  - `status` (TEXT) - e.g., "submitted", "under_review", "planned", "in_progress", "completed", "rejected"
  - `priority` (TEXT, optional) - "low", "normal", "high"
  - `votes` (INTEGER, default 0) - if voting is implemented
  - `created_at` (TIMESTAMPTZ)
  - `updated_at` (TIMESTAMPTZ)
  - `admin_notes` (TEXT, optional) - internal notes
- **RLS policies:** Users can create/view all requests; admins can update status/notes
- **Indexes:** `user_id`, `status`, `created_at`, `category`

### 2. Navigation integration (UX review required)
- **Placement:** Add to `DashboardNav.tsx` `navLinks` array
  - Options: standalone link, dropdown menu item, or icon button
  - Consider: position (before/after Weekly Digests?), label ("Feature Requests" vs "Feedback" vs icon-only)
  - Mobile: Include in hamburger menu
- **Visual treatment:** UX agent should review:
  - Icon choice (e.g., MessageSquare, Lightbulb, Sparkles)
  - Color/accent treatment (primary, secondary, muted)
  - Badge/indicator if admin responses exist
  - Whether it should be more prominent than other nav items

### 3. Feature request pages
- **`web/app/(dashboard)/feature-requests/page.tsx`** - List view
  - Show all requests (filterable by status, category)
  - User's submitted requests highlighted
  - Sort by: newest, votes (if implemented), status
  - "Submit Request" button/CTA
- **`web/app/(dashboard)/feature-requests/new/page.tsx`** - Submission form
  - Title input
  - Description textarea (rich text optional)
  - Category dropdown
  - Submit button
  - Success confirmation
- **`web/app/(dashboard)/feature-requests/[id]/page.tsx`** - Detail view
  - Full request details
  - Status badge
  - Admin response/notes (if admin)
  - Edit/delete (if user's own request and status allows)

### 4. API routes
- **`web/app/api/feature-requests/route.ts`**
  - `GET` - List requests (with filters, pagination)
  - `POST` - Create new request
- **`web/app/api/feature-requests/[id]/route.ts`**
  - `GET` - Get single request
  - `PATCH` - Update request (admin only for status/notes; user for own title/description)
  - `DELETE` - Delete request (user's own, or admin)

### 5. Admin interface (optional, phase 2)
- Admin page or section to manage requests
- Update status, add notes, mark as completed
- Could extend existing `/admin` page

## Relevant Files

- **Database:** New migration `web/supabase/migrations/[timestamp]_feature_requests.sql`
- **Navigation:** `web/components/layout/DashboardNav.tsx` - Add nav link (placement TBD by UX review)
- **Pages:** 
  - `web/app/(dashboard)/feature-requests/page.tsx` - List view
  - `web/app/(dashboard)/feature-requests/new/page.tsx` - Submission form
  - `web/app/(dashboard)/feature-requests/[id]/page.tsx` - Detail view
- **API:** 
  - `web/app/api/feature-requests/route.ts`
  - `web/app/api/feature-requests/[id]/route.ts`
- **Components:** 
  - `web/components/feature-requests/FeatureRequestList.tsx`
  - `web/components/feature-requests/FeatureRequestForm.tsx`
  - `web/components/feature-requests/FeatureRequestCard.tsx`
- **Types:** `web/lib/types/feature-requests.ts` (if needed)

## Risks / Notes

- **UX placement critical:** This is a first-class feature, so navigation placement and visual treatment matter. UX agent should review before implementation.
- **Voting system:** Consider adding voting (users can upvote requests) to prioritize popular features. Can be phase 2 if not in initial scope.
- **Notifications:** Consider email notifications when admin updates status (phase 2).
- **Integration:** Could integrate with GitHub Issues or Linear for admin workflow, but start with in-app for simplicity.
- **Spam prevention:** Consider rate limiting or CAPTCHA for submissions (if needed).

## Labels

- **Type:** feature
- **Priority:** high (first-class citizen requirement)
- **Effort:** medium-large (database, API, UI, navigation integration)
