/**
 * Rule-based voice checks for generated copy. No LLM calls.
 * Production: log warnings only; do not block writes.
 */

import { BANNED_PHRASES } from "./voice";

export interface VoiceCheckFields {
  headline?: string | null;
  body?: string | null;
  /** Digest-style second line */
  insight_summary?: string | null;
  what_it_means?: string | null;
  key_signal?: string | null;
  executive_summary?: string | null;
}

export interface VoiceCheckResult {
  passed: boolean;
  warnings: string[];
}

/** Match emoji sequences (broad Unicode ranges). */
const EMOJI_RE =
  /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{FE00}-\u{FE0F}\u{200D}\u{203C}\u{2049}\u{20E3}\u{2122}\u{2139}\u{2194}-\u{2199}\u{21A9}-\u{21AA}\u{231A}-\u{23ED}\u{23EF}\u{23F0}-\u{23F3}\u{23F8}-\u{23FA}\u{24C2}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2614}-\u{2615}\u{2648}-\u{2653}\u{267F}\u{2693}\u{26A1}\u{26AA}\u{26AB}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26CE}\u{26D4}\u{26EA}\u{26F2}-\u{26F3}\u{26F5}\u{26FA}\u{26FD}\u{2702}\u{2705}\u{270A}-\u{270B}\u{2728}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2795}-\u{2797}\u{27B0}\u{27BF}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{2B50}\u{2B55}]/u;

const WORD_RE = /\b[A-Z]{2,}\b/g;

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function hasAllCapsWord(text: string): boolean {
  const matches = text.match(WORD_RE);
  if (!matches) return false;
  const allow = new Set([
    "VP",
    "CEO",
    "CFO",
    "CTO",
    "CPO",
    "CMO",
    "COO",
    "CXO",
    "AML",
    "KYC",
    "API",
    "UI",
    "UX",
    "SEC",
    "SQL",
    "ETL",
    "BI",
    "AI",
    "ML",
    "SRE",
    "QA",
    "HR",
    "IT",
    "B2B",
    "B2C",
  ]);
  for (const m of matches) {
    if (allow.has(m)) continue;
    if (m.length >= 3 && /^[A-Z]+$/.test(m)) return true;
  }
  return false;
}

function checkText(
  label: string,
  text: string | null | undefined,
  options: { isHeadline?: boolean; checkExclaim?: boolean; checkJargonCaps?: boolean },
  warnings: string[]
): void {
  if (text == null || text === "") return;
  if (EMOJI_RE.test(text)) {
    warnings.push(`${label}: contains emoji`);
  }
  const lower = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) {
      warnings.push(`${label}: banned phrase "${phrase}"`);
    }
  }
  if (options.isHeadline) {
    const wc = wordCount(text);
    if (wc > 15) warnings.push(`${label}: headline too long (${wc} words, max 15)`);
    if (wc < 4 && wc > 0) warnings.push(`${label}: headline very short (${wc} words)`);
  }
  if (options.checkExclaim !== false && /!/.test(text)) {
    warnings.push(`${label}: contains exclamation mark`);
  }
  if (options.checkJargonCaps && hasAllCapsWord(text)) {
    warnings.push(`${label}: contains ALL CAPS word (verify acronym)`);
  }
}

/**
 * Run heuristic voice checks on one or more string fields.
 */
export function checkVoice(fields: VoiceCheckFields): VoiceCheckResult {
  const warnings: string[] = [];

  checkText("headline", fields.headline, { isHeadline: true }, warnings);
  checkText("body", fields.body, { isHeadline: false }, warnings);
  checkText("insight_summary", fields.insight_summary, { isHeadline: false }, warnings);
  checkText("what_it_means", fields.what_it_means, { isHeadline: false }, warnings);
  checkText("key_signal", fields.key_signal, { isHeadline: true }, warnings);
  checkText("executive_summary", fields.executive_summary, { isHeadline: false, checkJargonCaps: false }, warnings);

  return {
    passed: warnings.length === 0,
    warnings,
  };
}

/**
 * 0–100 score for Prompt Forge: 100 minus weighted violations.
 */
export function voiceComplianceScore(warnings: string[]): number {
  if (warnings.length === 0) return 100;
  const emoji = warnings.filter((w) => w.includes("emoji")).length;
  const banned = warnings.filter((w) => w.includes("banned phrase")).length;
  const exclaim = warnings.filter((w) => w.includes("exclamation")).length;
  const len = warnings.filter((w) => w.includes("headline")).length;
  const caps = warnings.filter((w) => w.includes("ALL CAPS")).length;
  const penalty = emoji * 15 + banned * 20 + exclaim * 8 + len * 5 + caps * 10;
  return Math.max(0, 100 - penalty);
}
