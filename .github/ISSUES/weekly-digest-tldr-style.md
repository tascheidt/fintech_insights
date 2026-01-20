# Weekly Digest: TLDR-Style Voice & Visual Redesign

## TL;DR
Restyle weekly digests (email + web) to match Wealthsimple TLDR's punchy, conversational tone and clean visual design. Think "🚀 Koho bets big on small businesses!" instead of "Koho - VP of Small Business Lending."

## Type
`improvement`

## Priority
`normal`

## Effort
`medium`

---

## Current State vs Expected

### Current State
- **Visual**: Corporate gradient headers, stat-heavy boxes, formal layout
- **Voice**: "Fintech Competitive Intelligence Report", "Strategic Insights Generated", business-speak
- **Headlines**: Literal job titles ("VP of Engineering", "Senior Product Manager")

### Expected Outcome
- **Visual**: Clean, minimal design with generous whitespace, emoji accents
- **Voice**: Casual, conversational, fun to read
- **Headlines**: Punchy summaries that tell a story ("🔥 Wealthsimple goes all-in on AI!", "💼 Koho bets big on small businesses!")

### Reference
[Wealthsimple TLDR Archive](https://tldr-archive.wealthsimple.com/) - Note the emoji headlines, conversational tone, clean layout.

---

## Scope

### 1. Email Template (`templates/email_report.html`)
- Simplify visual design - remove gradient header, reduce stat boxes
- Add emoji support in headlines
- Lighter, more readable typography
- Conversational footer ("That's a wrap for this week!")

### 2. Web Component (`web/components/dashboard/WeeklyDigestsList.tsx`)
- Match email styling for consistency
- Punchy headline display instead of just company names
- Consider archive-style date grouping (like TLDR's monthly archives)

### 3. AI-Generated Content Voice
- Update prompts in `web/lib/analysis/advanced-strategic.ts` to generate:
  - Punchy, emoji-forward headlines for each insight
  - Conversational executive summaries
  - "What this means" takeaways in plain language

### 4. Report Generator (`src/reports/generator.py`)
- Add `headline` field to insight data structure
- Support emoji in templates

---

## Files to Touch
- `templates/email_report.html` - Email template redesign
- `web/components/dashboard/WeeklyDigestsList.tsx` - Web component updates
- `web/lib/analysis/advanced-strategic.ts` - AI prompt voice updates
- `src/reports/generator.py` - Data structure for headlines

---

## Example Transformations

| Before | After |
|--------|-------|
| "Wealthsimple - Senior ML Engineer" | "🤖 Wealthsimple doubles down on AI" |
| "Koho - VP of Small Business" | "💼 Koho bets big on small businesses!" |
| "Neo Financial - 3 new postings" | "🚀 Neo's hiring spree continues" |
| "Strategic Insights Generated: 5" | "5 things you should know this week" |

---

## Notes
- Keep the underlying data/analytics intact - this is a presentation layer change
- Don't copy TLDR branding, just the voice and visual philosophy
- Emojis should feel natural, not forced - one per headline max
- Test email rendering across clients (Gmail, Outlook, Apple Mail)
