/**
 * Retry-with-backoff wrapper around Resend SDK calls.
 *
 * Resend's `data/error` envelope (see `getResendError`) does not throw on
 * 4xx/5xx — callers must explicitly check `error`. This helper folds both
 * thrown errors AND `error`-envelope failures into the same retry loop so
 * transient upstream issues (rate limits, brief 5xx blips) don't take down
 * a cron run.
 *
 * Each retry-and-failure logs a structured `log.warn` with the attempt
 * number and the upstream error. After the final attempt, the most recent
 * error is returned (or thrown for the throwing variant).
 */

import { log } from "@/lib/log";
import { getResendError } from "@/lib/email/resend-result";

export interface RetryOptions {
  /** Number of attempts (including the first). Default: 3. */
  maxAttempts?: number;
  /** Base delay in ms. Each retry uses `baseMs * 4^(attempt-1)` (1s, 4s, 16s by default). */
  baseMs?: number;
  /** Logical label included in retry log lines. */
  label: string;
}

export type ResendCallResult<T> =
  | { ok: true; data: T; attempts: number }
  | { ok: false; error: string; attempts: number };

/**
 * Run a Resend SDK call (or any function returning Resend's `{ data, error }`
 * envelope) with exponential backoff. Returns a discriminated-union result —
 * callers decide how to handle a permanent failure.
 *
 * Default schedule with `baseMs=1000`: ~1s, ~4s, ~16s. Total ~21s of waits
 * before the third attempt completes — well under the 300s cron timeout.
 */
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
      log.warn(
        { label: opts.label, attempt, maxAttempts, error: lastError, delayMs },
        "Resend call failed; retrying after backoff"
      );
      await sleep(delayMs);
    } else {
      log.warn(
        { label: opts.label, attempt, maxAttempts, error: lastError },
        "Resend call failed; out of retries"
      );
    }
  }

  return { ok: false, error: lastError, attempts: maxAttempts };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
