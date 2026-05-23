import { convert } from "html-to-text";

export function htmlToText(html: string): string {
  if (!html) return "";
  return convert(html, { wordwrap: 0 }).trim();
}

export function detectLocationType(location: string, description = ""): string | null {
  const combined = `${location} ${description}`.toLowerCase();
  if (/remote/.test(combined)) return /hybrid/.test(combined) ? "hybrid" : "remote";
  if (/hybrid/.test(combined)) return "hybrid";
  if (location) return "onsite";
  return null;
}

export function normalizeCommitment(commitment: string): string | null {
  if (!commitment) return null;
  const c = commitment.toLowerCase();
  if (/full/.test(c)) return "full-time";
  if (/part/.test(c)) return "part-time";
  if (/contract|temp/.test(c)) return "contract";
  if (/intern/.test(c)) return "internship";
  return commitment;
}

/**
 * Decode the common HTML entities that ATS providers double-escape into
 * embedded JSON (`&lt;div&gt;` style). `&amp;` is decoded LAST — otherwise
 * a doubly-encoded sequence like `&amp;lt;` would first become `&lt;` then
 * incorrectly be decoded to `<`. The previous order-sensitive bug existed
 * in two private copies (phenom-rbc.ts, scotiabank.ts); this is the
 * canonical implementation — import from here instead of recreating.
 */
export function decodeHtmlEntities(s: string): string {
  if (!s) return s;
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&"); // last — see header
}
