/**
 * Resend's SDK returns { data, error } from HTTP methods and does not throw on
 * 4xx/5xx — callers must check `error` or silent failures look like success.
 */
export function getResendError(result: { error: unknown }): string | null {
  if (result.error == null) return null;
  const err = result.error as Record<string, unknown>;
  const message =
    typeof err.message === "string" ? err.message : JSON.stringify(result.error);
  const name = typeof err.name === "string" ? err.name : "resend_error";
  return `${name}: ${message}`;
}
