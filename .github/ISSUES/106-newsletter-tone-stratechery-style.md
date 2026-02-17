# 106 – Newsletter Tone: Stratechery-Style Professional Analysis

## TL;DR

Adjust the weekly digest newsletter tone to be less cheeky and more objective while staying readable—a blend of professional analysis and insight in the vein of Ben Thompson's Stratechery. The audience is primarily professionals interested in the fintech industry.

## Current vs Expected

| Current | Expected |
|--------|----------|
| "Witty, punchy, conversational"; "Use emojis effectively"; headlines like "hits the gas", "raids the Street". | Objective, analytical tone with clear strategic insight; fewer emojis and less slang. |
| TLDR-style that leans playful and attention-grabbing. | Stratechery-style: evidence-based, interpretive, and professional without being dry or corporate. |
| Prompt encourages "punchy" and "smart" with cheeky pattern cues (e.g. "battening down the hatches"). | Prompt steers toward concise analysis, strategic interpretation, and what-it-means framing suitable for industry professionals. |

## Key Requirements

### 1. Tone calibration (not a full rewrite)
- **Less:** Witty one-liners, heavy emoji use, colloquial phrases ("hits the gas", "raids the Street"), "punchy" as primary goal.
- **More:** Clear strategic interpretation, cause-and-effect reasoning, objective framing ("X suggests Y"; "the hiring mix indicates…").
- **Keep:** Concise, scannable format; insight over generic summary; no corporate jargon.
- **Reference:** Stratechery—analytical, structured, and insightful without being stuffy or overly formal.

### 2. Prompt updates in digest generation
- **`web/lib/analysis/digest.ts`:**
  - **TLDR_PROMPT:** Revise the system/role line and style guidelines (e.g. "witty … punchy … Use emojis effectively") to "professional analyst … objective and insightful … emojis optional and minimal."
  - Update headline/body examples from cheeky to analytical (e.g. "Wealthsimple accelerates hiring in wealth and crypto" vs "Wealthsimple hits the gas").
  - Adjust "Pattern Detection" to emphasize strategic interpretation rather than catchy phrases.
  - Keep JSON output shape and self-check; tune the self-check for "would a fintech professional find this analytically useful?"
  - **GLOBAL_SUMMARY_PROMPT:** Align tone—"elite fintech analyst" is fine; add explicit guidance for objective, cross-company synthesis and optional/minimal emoji.

### 3. Email template (if tone is embedded there)
- **`web/lib/email/templates/weekly-digest.tsx`:** If any copy or labels are cheeky or informal, align with the new tone (e.g. section titles, call-to-action text). Otherwise no change.

### 4. Optional: one-shot examples in prompt
- Consider adding 1–2 example headline/body pairs in the desired Stratechery-like style so the model has a clear target (e.g. analytical headline + 2–3 sentence interpretation).

## Relevant Files

- `web/lib/analysis/digest.ts` – `TLDR_PROMPT`, `GLOBAL_SUMMARY_PROMPT`, and any other tone-bearing strings.
- `web/lib/email/templates/weekly-digest.tsx` – Digest email layout/copy; adjust only if it reinforces the old tone.

## Risks / Notes

- Shifting tone may change output length or structure slightly; spot-check a few generated digests after changes.
- If future features (e.g. company-filtered digest) reuse the same prompts, the new tone will apply consistently.
- Stratechery is a useful reference for "professional but not boring"; avoid making the copy stiff or generic.

## Labels

- **Type:** improvement
- **Priority:** normal
- **Effort:** small–medium
