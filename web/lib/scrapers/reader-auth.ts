/**
 * Optional credential for the r.jina.ai Reader relay used by the CIBC
 * (Workday) and Revolut (Cloudflare) fallbacks.
 *
 * Anonymous Reader requests work from most networks but are sometimes refused
 * with HTTP 401 from GitHub Actions runner IPs (Revolut, Nov 19 2026:
 * `reader status 401` on every attempt, while the same request succeeded from
 * elsewhere). Setting `JINA_API_KEY` sends an authenticated request instead,
 * which is not subject to that refusal. Without the env var nothing changes.
 */
export function readerAuthHeaders(
  env: Record<string, string | undefined> = process.env
): Record<string, string> {
  const key = env.JINA_API_KEY?.trim();
  return key ? { Authorization: `Bearer ${key}` } : {};
}
