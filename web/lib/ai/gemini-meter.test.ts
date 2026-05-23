import { describe, it, expect } from "vitest";
import { recordUsage } from "./gemini-meter";

describe("recordUsage — thinking token inference", () => {
  it("uses the named thoughtsTokenCount when the SDK returns it", () => {
    const r = recordUsage({
      callSite: "test",
      modelRequested: "gemini-pro-latest",
      groundingEnabled: false,
      usageMetadata: {
        promptTokenCount: 1000,
        candidatesTokenCount: 200,
        cachedContentTokenCount: 0,
        thoughtsTokenCount: 5000,
        totalTokenCount: 6200,
      },
      latencyMs: 100,
      status: "ok",
    });
    expect(r.thoughtsTokens).toBe(5000);
    // 1000 input + 200 output + 5000 thoughts at Pro rates:
    //   input: 1000 * 1.25/M = 0.00125
    //   output: 200 * 10/M = 0.002
    //   thoughts: 5000 * 10/M = 0.05
    expect(r.estimatedUsd).toBeCloseTo(0.00125 + 0.002 + 0.05, 6);
  });

  it("infers thoughtsTokens from total residual when SDK omits the named field", () => {
    // Gemini 2.5 Flash often does this — totalTokenCount > prompt + candidates
    const r = recordUsage({
      callSite: "test",
      modelRequested: "gemini-flash-latest",
      groundingEnabled: false,
      usageMetadata: {
        promptTokenCount: 2000,
        candidatesTokenCount: 250,
        cachedContentTokenCount: 0,
        totalTokenCount: 5000, // implies 2750 thinking tokens
      },
      latencyMs: 100,
      status: "ok",
    });
    expect(r.thoughtsTokens).toBe(2750);
  });

  it("does not infer negative thinking tokens (clamps to 0)", () => {
    const r = recordUsage({
      callSite: "test",
      modelRequested: "gemini-flash-latest",
      groundingEnabled: false,
      usageMetadata: {
        promptTokenCount: 1000,
        candidatesTokenCount: 500,
        // total < input + output — possible on errored calls
        totalTokenCount: 1200,
      },
      latencyMs: 100,
      status: "ok",
    });
    expect(r.thoughtsTokens).toBe(0);
  });

  it("treats missing usageMetadata as zero tokens, zero cost", () => {
    const r = recordUsage({
      callSite: "test",
      modelRequested: "gemini-pro-latest",
      groundingEnabled: false,
      latencyMs: 100,
      status: "error",
      errorMessage: "boom",
    });
    expect(r.thoughtsTokens).toBe(0);
    expect(r.estimatedUsd).toBe(0);
  });
});
