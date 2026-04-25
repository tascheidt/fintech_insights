/**
 * Next.js instrumentation hook — runs once per server runtime startup.
 *
 * Two responsibilities:
 *
 * 1. Importing `@/lib/env` triggers the Zod-validated env schema. If any
 *    required variable is missing, the app refuses to boot rather than
 *    crashing at request time.
 * 2. Loads the appropriate Sentry init (server or edge) so unhandled errors
 *    in API routes and server components are reported automatically. DSN is
 *    server-side only — see `sentry.server.config.ts`.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Sentry's nextjs SDK exports an `onRequestError` hook that the Next.js
// instrumentation contract picks up automatically — re-export so cron route
// errors surface without needing manual `Sentry.captureException` everywhere.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
