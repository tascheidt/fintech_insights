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
