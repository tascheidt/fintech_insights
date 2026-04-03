/**
 * Runtime voice rules for AI-generated user-facing copy.
 * Canonical human doc: docs/voice.md — keep this file in sync when editorial updates voice.
 */

export const VoiceContentType = [
  "analysis",
  "digest",
  "narrative",
  "chat",
  "extraction",
] as const;
export type VoiceContentType = (typeof VoiceContentType)[number];

/** Lowercase substrings that suggest hype / non-neutral tone in analytical fields. */
export const BANNED_PHRASES = [
  "bets big",
  "betting big",
  "doubles down",
  "game-changer",
  "game changer",
  "massive",
  "huge ",
  " huge",
  "crushing it",
  "moonshot",
  "you won't believe",
  "secret weapon",
  "tl;dr",
  "tldr",
  "won the internet",
] as const;

/** Core rules injected into prompts (compact for token budget). */
export const VOICE_RULES_CORE = `VOICE (required for all user-visible text you produce):
- Evidence-first: tie claims to job data, hiring patterns, or cited sources; separate observation from inference.
- Neutral, analytical tone: research brief style — not marketing, not social hype.
- Headlines: 6–12 words, plain and specific; NO emojis, NO exclamation marks, no clickbait.
- Body: short sentences; prefer "continues to hire", "adds roles", "suggests" over hype.
- Do NOT use: emojis, ALL CAPS emphasis (except standard acronyms), or sensational framing.
- Avoid banned hype phrasing including: betting big, doubles down, game-changer, massive, moonshot, TLDR-style hooks.`;

const DIGEST_ADDENDUM = `For this digest summary specifically:
- Prefer "continues to hire" or "is still hiring" when the pattern is established.
- Do not mention tech stacks unless essential to the role type.
- If there is no clear change this week, say that directly.`;

const NARRATIVE_ADDENDUM = `For this narrative:
- Name systems, vendors, or role clusters when the evidence supports it.
- If evidence is thin, state uncertainty explicitly.
- No emoji; no promotional language.`;

const CHAT_ADDENDUM = `For chat replies:
- You may be conversational and helpful, but stay professional and evidence-grounded.
- No emojis unless the user uses them first; never use hype phrases or clickbait.
- When unsure, say so and suggest what would clarify.`;

const EXTRACTION_ADDENDUM = `For this extraction task:
- Maximize accuracy and structured fields; use terse neutral phrasing only where free text is required.`;

/**
 * Prompt-ready voice block for the given content surface.
 */
export function getVoiceDirective(contentType: VoiceContentType): string {
  switch (contentType) {
    case "digest":
      return `${VOICE_RULES_CORE}\n\n${DIGEST_ADDENDUM}`;
    case "analysis":
      return `${VOICE_RULES_CORE}\n\nApply the same headline and summary rules to executive/key-signal fields.`;
    case "narrative":
      return `${VOICE_RULES_CORE}\n\n${NARRATIVE_ADDENDUM}`;
    case "chat":
      return `${VOICE_RULES_CORE}\n\n${CHAT_ADDENDUM}`;
    case "extraction":
      return `${VOICE_RULES_CORE}\n\n${EXTRACTION_ADDENDUM}`;
  }
}
