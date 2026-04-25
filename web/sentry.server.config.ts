/**
 * Sentry server-side init.
 *
 * Loaded from `instrumentation.ts` when the Node.js runtime boots. Captures
 * unhandled errors and rejections from API routes and server components.
 *
 * DSN is server-side only (no NEXT_PUBLIC_ prefix) — browser-side error
 * reporting is intentionally out of scope (Stream D, P0).
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? "development",

    // Conservative sampling — we care about errors and cron monitor outcomes,
    // not full request tracing. Tune up later if/when we want APM data.
    tracesSampleRate: 0,

    // Release is auto-detected from VERCEL_GIT_COMMIT_SHA when present.
    release: process.env.VERCEL_GIT_COMMIT_SHA,

    // Don't send anything that smells like a secret. The pino redactor in
    // `@/lib/log` already covers structured logs; this catches anything
    // Sentry's auto-context picks up from the request.
    beforeSend(event) {
      if (event.request?.headers) {
        const headers = event.request.headers as Record<string, string>;
        delete headers.authorization;
        delete headers.Authorization;
        delete headers.cookie;
        delete headers.Cookie;
      }
      return event;
    },
  });
}
