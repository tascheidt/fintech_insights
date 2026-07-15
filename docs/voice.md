# Fintech Talent Brief — Editorial voice

**Owners:** Editorial team (with engineering syncing `web/lib/ai/voice.ts` on change)  
**Purpose:** Single reference for how all **user-visible** AI-generated prose should read.  
**Runtime:** `web/lib/ai/voice.ts` implements these rules for prompt injection; `web/lib/ai/voice-validator.ts` checks outputs (warnings only).

---

## Core principles

1. **Evidence-first** — Tie claims to hiring patterns, job titles, departments, or cited sources. Distinguish observation from inference.
2. **Neutral and analytical** — Read like a research brief, not marketing or social copy.
3. **Specific over hype** — Name role families, functions, or themes; avoid empty superlatives.
4. **Plain language** — Short sentences, minimal jargon; explain specialized terms when needed.
5. **Continuity vs change** — Prefer “continues to hire in …” when the pattern is established; only highlight a “new” signal when the evidence clearly supports it.

---

## Headlines (digest company lines, job insight headlines, company insight headlines)

- **Length:** about 6–12 words.
- **Tone:** plain, specific, declarative.
- **Do not use:** emojis, exclamation marks, ALL CAPS (except standard acronyms), clickbait, or slogan-style hooks.
- **Good:** “Wealthsimple adds bilingual customer success roles in Toronto.”  
- **Avoid:** “Wealthsimple bets big on bilingual support! 🎯”

---

## Body copy (summaries, bullet signals, narratives)

- Prefer verbs like *added*, *opened*, *continues*, *suggests*, *aligns with* over *revolutionary*, *massive*, *betting big*.
- **Do / don’t examples:**

| Do | Don’t |
|----|--------|
| “Three new compliance roles suggest staffing for payments regulatory scope.” | “They’re building a compliance fortress!” |
| “Hiring continues in engineering and product; no clear new function this week.” | “Huge hiring spree across the board!” |
| “Role focuses on real-time transfers and partner integrations.” | “Game-changing payments play 🚀” |

---

## Banned phrases and patterns (analytical surfaces)

Avoid these in headlines and analytical summaries (validator flags them):

- Hype / slang: “bets big”, “doubles down”, “game-changer”, “huge”, “massive”, “crushing it”, “moonshot”
- Newsletter hype: “TLDR”, “you won’t believe”, “secret weapon”
- Overreach: “clearly proves”, “definitely means” (prefer “suggests”, “is consistent with”)
- Template / telemetry diction (reads machine-written): “this activity continues”, “talent acquisition trends”, “observed data”, “establishes a baseline” — and avoid the stock skeletons “established year-to-date pattern”, “no new trends were detected”, “represents a minor addition”

Extend lists through PRs to `voice.md` and mirror in `web/lib/ai/voice.ts` (`BANNED_PHRASES`).

---

## By content type (brief)

| Type | Notes |
|------|--------|
| **Digest** (`digest`) | Objective, no emoji, no dramatic strategy language unless evidence-heavy. Editorial v2 (Jul 2026): write like an editor, not a classifier — lead with the most interesting specific fact, quote 1–2 real job titles when they carry the story, vary sentence structure between entries, spend words where the signal is (quiet week = one plain sentence), use the serial-memory context for earned streak claims, and never use the template skeletons listed above. |
| **Job & company insights** (`analysis`) | Same as digest for headlines and summaries; `model_reasoning` can be technical but still neutral. |
| **Narrative / strategy** (`narrative`) | Tech stack and initiative narratives: analytical, name vendors/systems when evidenced, state uncertainty when thin. |
| **Chat** (`chat`) | Slightly warmer and conversational is OK; still no emoji spam, no hype phrases above, cite uncertainty. |
| **Extraction** (`extraction`) | Minimal prose style rules: accuracy and structured fields over voice. |

---

## Workflow

1. Editorial updates this document and opens a PR.
2. Engineering updates `web/lib/ai/voice.ts` (and optionally validator rules) in the same or follow-up PR so prompts stay aligned.
3. Prompt Forge Arena surfaces **voice compliance** scores for weekly-digest (and future stages) so admins see drift before saving live config.

---

## Related code

- `web/lib/ai/voice.ts` — prompt blocks per content type  
- `web/lib/ai/voice-validator.ts` — rule-based checks  
- `web/lib/ai/prompt-config.ts` — digest default template (includes digest voice block)
