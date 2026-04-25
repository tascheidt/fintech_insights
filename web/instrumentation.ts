/**
 * Next.js instrumentation hook — runs once per server runtime startup.
 *
 * Importing `@/lib/env` here triggers the Zod-validated env schema. If any
 * required variable is missing, the app refuses to boot rather than crashing
 * at request time.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
  }
}
