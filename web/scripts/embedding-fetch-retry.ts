/** Retry only transient read failures; auth/schema errors must fail immediately. */
export function embeddingFetchRetryDelay(
  response: { status: number; error: { message: string } | null },
  attempt: number
): number | null {
  // Six total attempts, with 1/2/4/8/16 seconds between them.
  if (!response.error || attempt >= 6) return null;
  const transient =
    [0, 502, 503, 504, 520, 521, 522, 523, 524].includes(response.status) ||
    // Some gateways return an unstructured error without a useful status.
    (response.status >= 500 && /^(bad gateway|service unavailable|gateway time-?out)$/i.test(
      response.error.message.trim()
    ));
  return transient ? 1000 * 2 ** (attempt - 1) : null;
}
