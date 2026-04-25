/**
 * Vitest global setup. Runs once before each test file.
 *
 * Goals:
 *  - Quiet down pino so test output stays readable.
 *  - Stub out env vars so modules that read `process.env` directly at import
 *    time (e.g. `@/lib/supabase/admin`) don't throw during a test that mocks
 *    the module anyway.
 *
 * Per-test mocks (Supabase admin client, Gemini SDK, etc.) live in the
 * individual test files via `vi.mock(...)`.
 */

import { vi } from "vitest";

// Provide minimum-viable env vars so any module that reads `process.env` at
// import time does not fault. Tests that exercise the env loader specifically
// (`web/lib/env.test.ts`) reset and re-stub these themselves.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.GEMINI_API_KEY ??= "test-gemini-key";
process.env.CRON_SECRET ??= "test-cron-secret";
process.env.RESEND_API_KEY ??= "test-resend-key";
// NODE_ENV is typed as a read-only literal union, so assign through the index
// signature to satisfy strict TS without weakening the typing of `env`.
(process.env as Record<string, string | undefined>).NODE_ENV ??= "test";

// Mock the centralized logger so tests don't spam pino output and so
// log assertions can be made (none of the six tests do, but it keeps the
// surface clean).
vi.mock("@/lib/log", () => {
  const noop = () => {};
  return {
    log: {
      info: noop,
      warn: noop,
      error: noop,
      debug: noop,
      trace: noop,
      fatal: noop,
      child: () => ({
        info: noop,
        warn: noop,
        error: noop,
        debug: noop,
        trace: noop,
        fatal: noop,
      }),
    },
  };
});
