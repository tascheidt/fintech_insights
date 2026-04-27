# NEW_ROUTES.md — Surfaces that don't exist in code yet

Seven new (or substantially-new) screens. For each, the route file path, the
source-of-truth JSX in this project, and the key data shapes the page needs.

---

## 1. `/login` (redesign — route exists)

**Existing:** `web/app/(auth)/login/page.tsx` (4,035 bytes)
**Source of truth:** `ui_kits/talent_brief/Login.jsx`
**Treatment:** Editorial. Split layout — form panel on the left, gradient-dawn
aside on the right with a frosted pull-quote from this week's digest.

### Implementation notes

- Keep the existing Google OAuth Supabase logic. We're only redesigning markup.
- Wrap the panel + aside in a `grid grid-cols-[minmax(380px,1fr)_minmax(0,1.1fr)]`
  responsive container. Stack on ≤880px.
- The Fraunces hero is `text-[44px] font-display font-semibold tracking-[-0.022em] leading-[1.08] max-w-[11ch]`.
- The pull-quote on the right needs **a real digest snippet from the most
  recent published digest** — pass it server-side via the page's `loader`,
  don't hard-code.

### Data shape

```ts
type LoginPageProps = {
  pullQuote: {
    eyebrow: string;     // "From this week's digest"
    body: string;        // 1-sentence excerpt
    meta: string;        // "Apr 21 – Apr 27 · 5 companies · 47 active roles"
  };
};
```

---

## 2. `/companies/[slug]` (redesign + new sections)

**Existing:** `web/app/(dashboard)/companies/[slug]/page.tsx` (17,353 bytes — already substantial)
**Source of truth:** `ui_kits/talent_brief/CompanyDetail.jsx`

This is a **redesign + additive**. The existing page likely has postings and
maybe basic stats. We're adding:

1. Stated strategy block (public moves + 1-line thesis)
2. Hiring evolution stacked-bar chart (6 / 12 / All time toggle)
3. Editorial **Interpretation** block under the chart
4. Strategic signals timeline (`SignalsTimeline.jsx` with `variant="vertical"`)

### Implementation notes

- Reuse the existing data fetching for postings.
- Add new fields:
  - `company.thesis: string` (1 sentence, editorial)
  - `company.externalMoves: { date: string; what: string }[]` (3 items)
  - `company.hiringByMonth: { month: string; eng: number; product: number; payments: number; compliance: number; customer: number }[]`
  - `company.signals: TimelineEvent[]` (see SignalsTimeline interface below)
- The chart can use Recharts (already a dep) or stay SVG-native — the JSX
  reference uses raw SVG and that's fine for production too.
- The interpretation block is **author-written**, not LLM-generated. Add a
  `company.interpretation: string` field; surface "needs interpretation" in
  admin when null.

### Data shape

```ts
type CompanyDrillDown = {
  // Header
  name: string;
  initial: string;
  brandColor: string;       // CSS color, falls back to var(--pacific-500)
  hq: { city: string; country: string };
  ats: "Lever" | "Greenhouse" | "Workable" | "Workday" | "—";
  scope: "strategic" | "templates" | "paused";

  // Stated strategy
  thesis: string;
  externalMoves: { date: string; what: string }[];   // 2–4 items

  // Stats
  stats: {
    activeRoles: number;
    net30d: number;
    velocity: number;        // new roles/week
    medianAgeDays: number;
  };

  // Hiring evolution — counts of NEW postings observed in each bucket
  hiringByMonth: Array<{
    month: string;           // "Apr"
    eng: number; product: number; payments: number;
    compliance: number; customer: number;
  }>;

  // Editorial interpretation — author-written
  interpretation: string;    // 2–4 sentences

  // Signals (uses TimelineEvent below)
  signals: TimelineEvent[];

  // Postings
  jobs: Job[];
};
```

---

## 3. `/jobs/[id]` (redesign)

**Existing:** `web/app/(dashboard)/jobs/[id]/page.tsx` (3,923 bytes)
**Source of truth:** `ui_kits/talent_brief/JobDetail.jsx`

### Implementation notes

- Two-column layout: posting body on the left (`minmax(0, 1fr)`),
  signals sidebar on the right (`320px`). Stack on ≤980px.
- The posting body is split into paragraphs; each paragraph that contains a
  detected signal renders an inline `<JobSignalChip>` row underneath.
- The sidebar shows the consolidated list of all extracted signals + a
  "Why this matters" editorial block linking to the company drill-down.

### Data shape

```ts
type JobDetail = {
  title: string;
  company: { name: string; initial: string; brandColor: string; slug: string };
  loc: string;
  fn: string;
  level: string;
  posted: string;       // ISO date
  comp?: string;        // free-text "$165,000 – $210,000 CAD + equity"
  url: string;          // source ATS URL

  // Body — split into paragraphs by the extraction pipeline
  paragraphs: string[];

  // Each signal references a paragraph index
  signals: Array<{
    kind: "scope" | "tech" | "regulatory" | "team" | "comp";
    text: string;
    strength: "strong" | "moderate" | "weak";
    sourcePara: number;
  }>;

  // Editorial — written by analyst, optional but encouraged
  framing?: string;
};
```

---

## 4. `/digests/archive` (new route)

**Source of truth:** `ui_kits/talent_brief/DigestArchive.jsx`

### Implementation notes

- New page under existing `(dashboard)/digests/` group.
- Each row: date range + year, lede, signal-density pips (5 max), net hiring
  number, arrow.
- Click row → `/digests/[id]`.
- Year toggle filter (2026 / 2025 / All).

### Data shape

```ts
type DigestArchiveRow = {
  id: string;
  range: string;       // "Apr 21 – Apr 27"
  year: string;
  lede: string;        // 1 sentence
  signalCount: number; // 0–5+, capped at 5 for the pip rendering
  netHiring: number;   // can be negative
};
```

---

## 5. `/settings` (redesign)

**Existing:** `web/app/(dashboard)/settings/page.tsx` (1,449 bytes — minimal)
**Source of truth:** `ui_kits/talent_brief/Settings.jsx`

### Implementation notes

- Add tab navigation: Notifications / Sources / Account / Team.
  Each tab is its own page route or a client-side tab — your call.
- Notifications tab: weekly digest toggle, strong-signal alerts toggle, day select.
- Sources tab: ATS source health table (Company / ATS / Last polled / Status / Logs link).
- Account / Team tabs: stub for now.

### Data shape

```ts
type SettingsState = {
  notifications: {
    digestEmail: boolean;
    signalAlerts: boolean;
    digestDay: "monday" | "tuesday" | "friday";
  };
};

type ATSSource = {
  companyId: string;
  companyName: string;
  ats: string;
  lastPolled: string;     // relative or ISO
  status: "ok" | "warn" | "pending";
};
```

---

## 6. `/(marketing)` route group (new)

**Source of truth:** `ui_kits/talent_brief/Marketing.jsx`

### Implementation notes

- New top-level route group `web/app/(marketing)/page.tsx`.
- The auth middleware should let logged-out users land here at `/`. Logged-in
  users get redirected to `/dashboard` (existing behavior — keep it).
- Hero uses `--gradient-coast` full-bleed; eyebrow uses `text-foreground`
  (NOT `text-primary` — see verifier note about contrast on the gradient).
- "Read a sample digest" link → `/digests/[publicSampleId]` — exposing one
  sample digest unauthenticated is up to you; if not, link to a static
  `/sample` route.
- Coverage section pulls real company list, but only company name + scope.

### Data shape

```ts
type MarketingPageProps = {
  stats: {
    companiesTracked: number;
    activeRolesThisWeek: number;
    signalsYTD: number;
  };
  coverage: Array<{
    name: string;
    location: string;
    scope: "strategic" | "templates" | "pending";
  }>;
  sampleDigest?: { id: string; quote: string; range: string; meta: string };
};
```

---

## 7. Empty / loading / error states

**Source of truth:** `ui_kits/talent_brief/EmptyStates.jsx`

### Implementation notes

Create one reusable component:

```tsx
// web/components/feedback/EmptyState.tsx
export function EmptyState({
  icon, title, body, primaryAction, secondaryAction, kind = "default"
}: EmptyStateProps) { /* … */ }
```

Wire it into:

| Route | Trigger | Variant |
|---|---|---|
| `/companies` | No companies tracked | `building-2` icon, "Pick the companies you want to watch" |
| `/companies` | First poll hasn't returned | `hourglass`, "Listening for postings" |
| `/digests` | No digests published yet | `newspaper`, "First digest goes out next Monday" |
| `/settings` (Sources tab) | A source is failing >30 min | `kind="warn"`, `alert-triangle` |

---

## SignalsTimeline shared component

**Source of truth:** `ui_kits/talent_brief/SignalsTimeline.jsx`
**Codebase target:** new file at `web/components/digests/SignalsTimeline.tsx`

```ts
export type TimelineEvent = {
  when: string;       // "6 weeks ago" | "Apr 14"
  title: string;
  body?: string;
  alignment?: "strong" | "moderate" | "weak" | "contra";
};

export function SignalsTimeline({
  events,
  variant = "responsive",
}: {
  events: TimelineEvent[];
  variant?: "vertical" | "responsive";
}) { /* … */ }
```

Used by `/companies/[slug]` (vertical) and could optionally be added at the top
of `/digests/[id]` (responsive — horizontal scroll on wide, vertical on narrow).
