import type { DigestCommentary, GlobalSummary, WeeklyDigestCompanyInput } from "./digest";

/** Complete prose is a publishing requirement, independent of prompt wording. */
export function isCompleteDigestProse(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!/[.!?]["”’')\]]*$/.test(normalized) || /(?:\.\.\.|…)\s*["”’')\]]*$/.test(normalized)) return false;
  // A period appended to a fragment does not make it publishable.
  if (/\b(?:and|or|but|while|with|including|alongside|because|such as|as well as|to|of|for|the|a|an)\s*[.!?](?:\s|$|["”’')\]])/i.test(normalized)) return false;
  if (normalized.includes("\\") || (normalized.match(/"/g)?.length ?? 0) % 2 !== 0) return false;
  for (const [open, close] of [["“", "”"], ["(", ")"], ["[", "]"]]) {
    if (normalized.split(open).length !== normalized.split(close).length) return false;
  }
  return true;
}

export function assertDigestGenerationFinished(finishReason: string | undefined): void {
  if (finishReason !== "STOP") {
    throw new Error(`Digest generation did not finish naturally (${finishReason ?? "missing finish reason"})`);
  }
}

function readDigestObject(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Digest response must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function readText(value: unknown, field: string, prose = true): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Digest ${field} must be a non-empty string`);
  }
  const text = value.replace(/\s+/g, " ").trim();
  if (prose && !isCompleteDigestProse(text)) {
    throw new Error(`Digest ${field} contains unfinished prose`);
  }
  return text;
}

function readOptionalProse(value: unknown, field: string): string | null {
  return value == null ? null : readText(value, field);
}

/** Never recover fields with regex: escaped job-title quotes can look like field endings. */
export function parseDigestCommentaryResponse(text: string): DigestCommentary {
  const parsed = readDigestObject(text);
  return {
    headline: readText(parsed.headline, "headline", false),
    body: readText(parsed.body, "body"),
    new_signal: readOptionalProse(parsed.new_signal, "new_signal"),
  };
}

export function parseDigestGlobalSummaryResponse(text: string): GlobalSummary {
  const parsed = readDigestObject(text);
  return {
    headline: readText(parsed.headline, "headline", false),
    key_insight: readText(parsed.key_insight, "key_insight"),
    body: readText(parsed.body, "body"),
    watching: readOptionalProse(parsed.watching, "watching"),
  };
}

export function buildDigestCommentaryFallback(input: WeeklyDigestCompanyInput): DigestCommentary {
  const themes = input.weekly_role_themes.slice(0, 2).map((theme) => theme.label.toLowerCase());
  const focus = new Intl.ListFormat("en").format(themes);
  return {
    headline: `${input.company_name} adds ${focus || "new roles"} postings this week`,
    body: `${input.week_job_count} ${input.week_job_count === 1 ? "role was" : "roles were"} first observed at ${input.company_name} this week.${focus ? ` The listings cover ${focus}.` : ""}`,
    // A failed generation cannot establish an editorial signal.
    new_signal: null,
  };
}

/** One retry, then factual copy; a company must not disappear because its prose failed. */
export async function generateCompleteDigestCopy<T>(
  request: (attempt: number) => Promise<T>,
  fallback: () => T,
  onRejected: (error: unknown, attempt: number) => void
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await request(attempt);
    } catch (error) {
      onRejected(error, attempt);
    }
  }
  return fallback();
}
