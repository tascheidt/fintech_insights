import { describe, it, expect } from "vitest";
import { estimateUsd, GROUNDING_PER_REQUEST_USD, GROUNDING_CALIBRATION } from "./gemini-pricing";

describe("estimateUsd — thinking tokens (Gemini 2.5)", () => {
  it("bills thinking tokens at the output rate for Pro", () => {
    // Pro outputPerM = $10.0
    const usd = estimateUsd("gemini-pro-latest", {
      inputTokens: 0,
      outputTokens: 0,
      thoughtsTokens: 1_000_000,
      groundingEnabled: false,
    });
    expect(usd).toBeCloseTo(10.0, 6);
  });

  it("bills thinking tokens at the output rate for Flash", () => {
    // Flash outputPerM = $2.5
    const usd = estimateUsd("gemini-flash-latest", {
      inputTokens: 0,
      outputTokens: 0,
      thoughtsTokens: 1_000_000,
      groundingEnabled: false,
    });
    expect(usd).toBeCloseTo(2.5, 6);
  });

  it("sums input + output + thinking + grounding correctly", () => {
    const usd = estimateUsd("gemini-pro-latest", {
      inputTokens: 100_000, // $0.125
      outputTokens: 20_000, // $0.200
      thoughtsTokens: 30_000, // $0.300
      groundingEnabled: true, // +$0.035
    });
    expect(usd).toBeCloseTo(0.125 + 0.2 + 0.3 + GROUNDING_PER_REQUEST_USD, 6);
  });

  it("treats missing thoughtsTokens as 0 (backward compat)", () => {
    const without = estimateUsd("gemini-flash-latest", {
      inputTokens: 1_000,
      outputTokens: 500,
      groundingEnabled: false,
    });
    const withZero = estimateUsd("gemini-flash-latest", {
      inputTokens: 1_000,
      outputTokens: 500,
      thoughtsTokens: 0,
      groundingEnabled: false,
    });
    expect(without).toBe(withZero);
  });

  it("returns 0 for unknown models even with thinking tokens", () => {
    const usd = estimateUsd("gemini-mystery-model", {
      inputTokens: 1_000,
      outputTokens: 500,
      thoughtsTokens: 50_000,
      groundingEnabled: true,
    });
    expect(usd).toBe(0);
  });

  it("grounding calibration defaults to a no-op (=1) so existing estimates are unchanged", () => {
    // If this fails, someone changed the active multiplier without updating the
    // assertions above — make that deliberate, not accidental.
    expect(GROUNDING_CALIBRATION).toBe(1);
    const usd = estimateUsd("gemini-pro-latest", {
      inputTokens: 0,
      outputTokens: 0,
      groundingEnabled: true,
    });
    expect(usd).toBeCloseTo(GROUNDING_PER_REQUEST_USD * GROUNDING_CALIBRATION, 6);
  });
});
