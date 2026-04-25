/**
 * Sentry edge runtime init.
 *
 * Next 16 App Router needs a separate init for the Edge runtime (middleware,
 * edge route handlers). The proxy at `web/proxy.ts` runs in Node.js per
 * Stream A's setup, but a few internal libraries (Supabase SSR helpers) can
 * still spin up edge contexts during build, so we register a minimal init
 * here for completeness.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? "development",
    tracesSampleRate: 0,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
  });
}
