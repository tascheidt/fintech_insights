/**
 * Regression tests for the AI model resolver and model-ID policy.
 *
 * Guarantees we must preserve (per CLAUDE.md §5):
 *   1. The active config returned to callers always has a model in the
 *      approved AI_MODEL_OPTIONS enum.
 *   2. Every approved model is a floating `-latest` alias or a stable (GA)
 *      versioned ID — never a preview, experimental, or dated-snapshot ID like
 *      `gemini-3-pro-preview` (retired 2026-07-31, which broke feedback triage).
 *   3. Every approved model has a pricing row, so its spend is never costed at $0.
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

  it("returns a config whose model obeys the model-ID policy", async () => {
    const { getActiveWeeklyDigestAiConfig, AI_MODEL_VALUES, isAllowedModelId } = await import(
      "./prompt-config"
    );

    const config = await getActiveWeeklyDigestAiConfig();

    // Returned model must be one of the approved enum values…
    expect(AI_MODEL_VALUES).toContain(config.model);
    // …and an alias or a stable GA id, never a preview/experimental/snapshot.
    expect(isAllowedModelId(config.model)).toBe(true);
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

describe("per-surface model resolution", () => {
  it("modelFor returns the SURFACE_MODELS entry when no eval override is set", async () => {
    const { MODEL_SURFACES, SURFACE_MODELS, modelFor, AI_MODEL_VALUES, isAllowedModelId } = await import("./prompt-config");
    for (const surface of MODEL_SURFACES) {
      expect(modelFor(surface)).toBe(SURFACE_MODELS[surface]);
      expect(AI_MODEL_VALUES).toContain(SURFACE_MODELS[surface]);
      expect(isAllowedModelId(SURFACE_MODELS[surface])).toBe(true);
    }
  });

  it("eval overrides apply per surface and clear cleanly", async () => {
    const { SURFACE_MODELS, modelFor, setEvalModelOverride } = await import("./prompt-config");
    setEvalModelOverride("search-report", "candidate-model");
    expect(modelFor("search-report")).toBe("candidate-model");
    expect(modelFor("job-analysis")).toBe(SURFACE_MODELS["job-analysis"]);
    setEvalModelOverride("search-report", null);
    expect(modelFor("search-report")).toBe(SURFACE_MODELS["search-report"]);
  });
});

describe("no hardcoded model strings outside prompt-config", () => {
  // CLAUDE.md §5: every model string resolves through prompt-config.ts. This
  // scans production source so a literal like "gemini-flash-latest" or
  // "gemini-4-argon" in a call site fails CI instead of silently escaping
  // the eval suite and the SURFACE_MODELS table.
  it("finds no Gemini model literals in lib/ or app/", async () => {
    const { readdirSync, readFileSync, statSync } = await import("fs");
    const { join, relative } = await import("path");
    const root = join(__dirname, "..", "..");
    const allow = new Set([
      "lib/ai/prompt-config.ts",
      "lib/ai/gemini-pricing.ts", // rate table is keyed by model string
    ]);
    const MODEL_LITERAL =
      /["']gemini-(?:\d|pro|flash|embedding|argon|carbon|hydrogen|ultra|nano)[a-z0-9.\-]*["']/i;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== "node_modules") walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
        const rel = relative(root, full).split("\\").join("/");
        if (allow.has(rel)) continue;
        readFileSync(full, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (MODEL_LITERAL.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
          });
      }
    };
    walk(join(root, "lib"));
    walk(join(root, "app"));
    expect(offenders).toEqual([]);
  });
});

describe("model-ID policy", () => {
  it("allows -latest aliases and stable versioned ids", async () => {
    const { isAllowedModelId } = await import("./prompt-config");
    for (const id of ["gemini-flash-latest", "gemini-pro-latest", "gemini-2.5-flash", "gemini-4-argon"]) {
      expect(isAllowedModelId(id)).toBe(true);
    }
  });

  it("rejects preview, experimental and dated-snapshot ids", async () => {
    const { isAllowedModelId } = await import("./prompt-config");
    for (const id of [
      "gemini-3-pro-preview",
      "gemini-2.5-flash-preview-05-20",
      "gemini-exp-1206",
      "gemini-2.0-flash-experimental",
      "gemini-4-argon-0520",
      "gpt-4o",
    ]) {
      expect(isAllowedModelId(id)).toBe(false);
    }
  });

  it("every approved model obeys the policy and has a pricing row", async () => {
    const { AI_MODEL_VALUES, isAllowedModelId } = await import("./prompt-config");
    const { isPricedModel } = await import("./gemini-pricing");
    for (const id of AI_MODEL_VALUES) {
      expect(isAllowedModelId(id), id).toBe(true);
      expect(isPricedModel(id), `${id} needs a GEMINI_PRICING row`).toBe(true);
    }
  });
});
