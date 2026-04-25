/**
 * Regression tests for the heuristic voice checker.
 *
 * `checkVoice` is the last guardrail before AI-generated copy reaches a
 * user-facing surface. It's pure (no I/O, no LLM), so it's an ideal target
 * for a deterministic unit test. Cover three cases: a banned phrase, an
 * ALL CAPS word, and a known-good text returning `passed: true`.
 */

import { describe, it, expect } from "vitest";
import { checkVoice } from "./voice-validator";

describe("checkVoice", () => {
  it("returns passed=true for neutral, evidence-grounded copy", () => {
    const result = checkVoice({
      headline: "Wealthsimple continues to hire backend engineers this week",
      body: "The company added five engineering roles, all of which continue an existing pattern of platform investment.",
    });

    expect(result.passed).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("flags a banned hype phrase from voice.ts", () => {
    const result = checkVoice({
      headline: "Wealthsimple bets big on AI engineering hires",
      body: "Several roles were posted this week.",
    });

    expect(result.passed).toBe(false);
    expect(result.warnings.some((w) => w.includes("banned phrase"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("bets big"))).toBe(true);
  });

  it("flags exclamation marks (sensational framing per voice.ts)", () => {
    const result = checkVoice({
      headline: "Wealthsimple keeps hiring backend engineers!",
      body: "The company continues to add engineering roles.",
    });

    expect(result.passed).toBe(false);
    expect(result.warnings.some((w) => w.includes("exclamation"))).toBe(true);
  });
});
