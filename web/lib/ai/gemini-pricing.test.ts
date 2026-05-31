import { describe, it, expect } from "vitest";
import { estimateUsd, GROUNDING_PER_REQUEST_USD, GROUNDING_CALIBRATION } from "./gemini-pricing";

describe("estimateUsd — thinking tokens (Gemini 3.x)", () => {
  it("bills thinking tokens at the output rate for Pro", () => {
    // Pro outputPerM = $12.0 (Gemini 3 Pro, 2026-05 GCP rate)
    const usd = estimateUsd("gemini-pro-latest", {
      inputTokens: 0,
      outputTokens: 0,
      thoughtsTokens: 1_000_000,
      groundingEnabled: false,
    });
    expect(usd).toBeCloseTo(12.0, 6);
  });

  it("bills thinking tokens at the output rate for Flash", () => {
    // Flash outputPerM = $9.0 (Gemini 3.5 Flash, 2026-05 GCP rate)
    const usd = estimateUsd("gemini-flash-latest", {
      inputTokens: 0,
      outputTokens: 0,
      thoughtsTokens: 1_000_000,
      groundingEnabled: false,
    });
    expect(usd).toBeCloseTo(9.0, 6);
  });

  it("sums input + output + thinking + grounding correctly", () => {
    const usd = estimateUsd("gemini-pro-latest", {
      inputTokens: 100_000, // 100k * $2.00/M = $0.20
      outputTokens: 20_000, //  20k * $12.0/M = $0.24
      thoughtsTokens: 30_000, // 30k * $12.0/M = $0.36
      groundingEnabled: true, // grounding free-tier → +$0 (GROUNDING_CALIBRATION = 0)
    });
    expect(usd).toBeCloseTo(0.2 + 0.24 + 0.36 + GROUNDING_PER_REQUEST_USD * GROUNDING_CALIBRATION, 6);
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

  it("zeroes grounding cost while it is free-tier (GROUNDING_CALIBRATION = 0)", () => {
    // The 2026-05 GCP export showed grounding billed at $0 (free tier). If a
    // future export shows it being charged, set GROUNDING_CALIBRATION from the
    // export and update this assertion — deliberately, not accidentally.
    expect(GROUNDING_CALIBRATION).toBe(0);
    const usd = estimateUsd("gemini-pro-latest", {
      inputTokens: 0,
      outputTokens: 0,
      groundingEnabled: true,
    });
    expect(usd).toBe(0);
  });
});
