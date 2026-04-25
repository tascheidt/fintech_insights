/**
 * Regression tests for the env-var validator.
 *
 * The validator is the boot-time guarantee that every required secret is
 * present before any route handler runs. Two cases:
 *  1. A complete env passes and exposes a typed `env` object.
 *  2. A missing required var (here: GEMINI_API_KEY) throws with a useful
 *     error message that names the offending field.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

const REQUIRED = {
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  GEMINI_API_KEY: "gemini-key",
  CRON_SECRET: "cron-secret",
  RESEND_API_KEY: "resend-key",
} as const;

describe("env loader", () => {
  // Snapshot the original process.env so we can mutate it per-test without
  // leaking state across the file.
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    // Wipe all required vars first so tests start from a known state.
    for (const key of Object.keys(REQUIRED)) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("parses a complete env into a typed config object", async () => {
    Object.assign(process.env, REQUIRED);

    // Use isolated module loading so each test gets a fresh evaluation of
    // the env module (the module runs validation at import time).
    const mod = await import("./env");
    const env = mod.env;

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(REQUIRED.NEXT_PUBLIC_SUPABASE_URL);
    expect(env.GEMINI_API_KEY).toBe(REQUIRED.GEMINI_API_KEY);
    expect(env.CRON_SECRET).toBe(REQUIRED.CRON_SECRET);
    expect(env.RESEND_API_KEY).toBe(REQUIRED.RESEND_API_KEY);
  });

  it("throws a descriptive error when a required var is missing", async () => {
    Object.assign(process.env, REQUIRED);
    delete process.env.GEMINI_API_KEY;

    // The module performs validation at import time, so we must reset the
    // module registry to force a re-run with the mutated env.
    const { vi } = await import("vitest");
    vi.resetModules();

    let caught: unknown;
    try {
      await import("./env");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toMatch(/Invalid or missing environment variables/);
    expect(message).toMatch(/GEMINI_API_KEY/);
  });
});
