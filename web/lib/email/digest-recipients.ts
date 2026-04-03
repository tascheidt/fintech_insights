/**
 * Must match Settings semantics: weekly digest is on unless the user explicitly
 * opts out (weekly_digest false). Missing preferences or a missing key defaults
 * to opted in.
 */
export function isOptedInToWeeklyDigest(profile: {
  email: string | null | undefined;
  email_preferences: unknown;
}): boolean {
  if (!profile.email) return false;
  if (profile.email_preferences == null) return true;
  if (typeof profile.email_preferences !== "object") return true;
  const wd = (profile.email_preferences as { weekly_digest?: unknown })
    .weekly_digest;
  if (wd === false || wd === "false") return false;
  return true;
}
