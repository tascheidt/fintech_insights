/**
 * Wraps fetch with limited retries for transient network errors (common with
 * Supabase over flaky Wi‑Fi, VPN, or after sleep/wake). Only retries when no
 * response was received.
 */

const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "UND_ERR_SOCKET",
]);

function isRetryableFetchError(error: unknown): boolean {
  if (error instanceof TypeError && error.message === "fetch failed") return true;
  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;
  if (cause && typeof cause === "object" && "code" in cause) {
    return RETRYABLE_CODES.has(String((cause as { code?: string }).code));
  }
  return false;
}

const BASE_DELAY_MS = 200;
const MAX_ATTEMPTS = 4;

export const fetchWithRetry: typeof fetch = async (input, init) => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      lastError = e;
      if (attempt === MAX_ATTEMPTS || !isRetryableFetchError(e)) {
        throw e;
      }
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
};
