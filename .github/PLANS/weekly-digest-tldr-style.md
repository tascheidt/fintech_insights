# Weekly Digest TLDR-Style Redesign

**Overall Progress:** `80%`

## TLDR
Restyle weekly digests (email + web) with Wealthsimple TLDR's punchy voice and clean visuals. AI generates catchy headlines, templates get a minimal redesign.

## Critical Decisions
- **Content-first approach**: Update AI prompts first since they generate the punchy headlines that drive the redesign
- **Shared headline field**: Add `headline` to insight data structure used by both email and web
- **No branding copy**: Adopt voice/style philosophy only, not TLDR colors or logos

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

- [ ] 🟥 **Step 5: Test & Validate**
  - [ ] 🟥 Generate test digest with new AI prompts
  - [ ] 🟥 Preview email in Gmail/Outlook/Apple Mail
  - [ ] 🟥 Verify web component displays correctly
