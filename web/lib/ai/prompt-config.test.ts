/**
 * Regression tests for the AI model resolver.
 *
 * Two guarantees we must preserve (per CLAUDE.md §5):
 *   1. The active config returned to callers always has a model in the
 *      approved AI_MODEL_OPTIONS enum.
 *   2. That model is a `-latest` floating alias — never a versioned or
 *      preview ID like `gemini-2.0-flash` or `gemini-3-pro-preview`.
 *
 * The April 2026 cost incident was triggered by alias rotation; this test
 * is the cheap canary that fails if someone hardcodes a pinned model in a
 * default config or misses the enum check.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the admin Supabase client so the resolver can run without a real DB.
// The default config path triggers when `data` is empty, which is the
// realistic state on a fresh deployment (settings table not yet seeded).
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }),
}));

describe("getActiveWeeklyDigestAiConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a config whose model is a -latest alias", async () => {
    const { getActiveWeeklyDigestAiConfig, AI_MODEL_VALUES } = await import(
      "./prompt-config"
    );

    const config = await getActiveWeeklyDigestAiConfig();

    // Returned model must be one of the approved enum values.
    expect(AI_MODEL_VALUES).toContain(config.model);

    // CLAUDE.md hard rule: never pin a versioned/preview model. Always use
    // a `-latest` floating alias. This guards against someone slipping in
    // `gemini-2.0-flash` or `gemini-3-pro-preview` as a "temporary" override.
    expect(config.model).toMatch(/-latest$/);
    expect(config.model).not.toMatch(/preview/i);
    expect(config.model).not.toMatch(/-\d+\.\d+/); // e.g. "-2.0-", "-1.5-"
  });

  it("returns a config with the weekly-digest stage and required fields", async () => {
    const { getActiveWeeklyDigestAiConfig } = await import("./prompt-config");

    const config = await getActiveWeeklyDigestAiConfig();

    expect(config.stage).toBe("weekly-digest");
    expect(typeof config.promptTemplate).toBe("string");
    expect(config.promptTemplate.length).toBeGreaterThan(0);
    expect(typeof config.temperature).toBe("number");
    expect(typeof config.maxOutputTokens).toBe("number");
  });
});
