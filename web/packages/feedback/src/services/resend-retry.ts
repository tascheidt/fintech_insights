/**
 * Self-contained retry-with-backoff for Resend SDK calls inside the feedback
 * package. Mirrors `web/lib/email/resend-retry.ts` in shape but does not
 * import from the host app (the package must stay portable).
 *
 * 3 attempts, exponential backoff (1s / 4s / 16s by default). Each
 * retry-and-failure logs via `console.warn` — the package does not import
 * the host app's pino logger.
 */

import { getResendError } from "./resend-result";

export interface RetryOptions {
  maxAttempts?: number;
  baseMs?: number;
  label: string;
}

export type ResendCallResult<T> =
  | { ok: true; data: T; attempts: number }
  | { ok: false; error: string; attempts: number };

export async function retryResendCall<T>(
  fn: () => Promise<{ data: T | null; error: unknown }>,
  opts: RetryOptions
): Promise<ResendCallResult<T>> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseMs = opts.baseMs ?? 1000;
  let lastError = "unknown_error";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      const envelopeErr = getResendError(result);

      if (!envelopeErr && result.data != null) {
        return { ok: true, data: result.data, attempts: attempt };
      }

      lastError = envelopeErr ?? "missing_data";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < maxAttempts) {
      const delayMs = baseMs * Math.pow(4, attempt - 1);
      console.warn(
        `[feedback:resend-retry] ${opts.label} attempt ${attempt}/${maxAttempts} failed (${lastError}); retrying in ${delayMs}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } else {
      console.warn(
        `[feedback:resend-retry] ${opts.label} attempt ${attempt}/${maxAttempts} failed (${lastError}); out of retries`
      );
    }
  }

  return { ok: false, error: lastError, attempts: maxAttempts };
}
