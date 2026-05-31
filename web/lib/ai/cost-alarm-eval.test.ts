import { describe, it, expect } from "vitest";
import {
  evaluateGeminiUsage,
  type GeminiUsageRow,
  type GeminiUsageThresholds,
} from "./cost-alarm-eval";

const THRESHOLDS: GeminiUsageThresholds = { usd: 50, grounded: 500, tokens: 15_000_000 };

function row(over: Partial<GeminiUsageRow>): GeminiUsageRow {
  return {
    estimated_usd: 0,
    call_site: "extractJobStructure",
    model_served: "gemini-flash-latest",
    grounding_enabled: false,
    total_tokens: 0,
    ...over,
  };
}

describe("evaluateGeminiUsage — tripwires", () => {
  it("does not trip when every signal is under threshold", () => {
    const rows = [row({ estimated_usd: 10, total_tokens: 1_000_000 })];
    const { tripped } = evaluateGeminiUsage(rows, THRESHOLDS);
    expect(tripped).toEqual([]);
  });

  it("trips ONLY the USD wire when calibrated spend exceeds the threshold", () => {
    const rows = [row({ estimated_usd: 60, total_tokens: 1_000 })];
    const { tripped } = evaluateGeminiUsage(rows, THRESHOLDS);
    expect(tripped).toHaveLength(1);
    expect(tripped[0]).toContain("usd");
  });

  it("trips ONLY the grounded-call wire when grounded count exceeds the threshold", () => {
    // 501 cheap grounded calls: tiny $, tiny tokens, but count is over.
    const rows = Array.from({ length: 501 }, () =>
      row({ estimated_usd: 0.001, grounding_enabled: true, total_tokens: 10 })
    );
    const { tripped, metrics } = evaluateGeminiUsage(rows, THRESHOLDS);
    expect(metrics.groundedCalls).toBe(501);
    expect(tripped).toHaveLength(1);
    expect(tripped[0]).toContain("grounded-calls");
  });

  it("trips ONLY the token wire when token volume exceeds the threshold", () => {
    const rows = [row({ estimated_usd: 1, total_tokens: 16_000_000 })];
    const { tripped } = evaluateGeminiUsage(rows, THRESHOLDS);
    expect(tripped).toHaveLength(1);
    expect(tripped[0]).toContain("tokens");
  });

  it("can trip multiple wires at once", () => {
    const rows = [
      row({ estimated_usd: 60, grounding_enabled: true, total_tokens: 16_000_000 }),
      ...Array.from({ length: 600 }, () => row({ grounding_enabled: true })),
    ];
    const { tripped } = evaluateGeminiUsage(rows, THRESHOLDS);
    expect(tripped.map((t) => t.split(" ")[0]).sort()).toEqual([
      "grounded-calls",
      "tokens",
      "usd",
    ]);
  });

  it("parses string estimated_usd and tolerates null usd/tokens", () => {
    const rows = [
      row({ estimated_usd: "12.50" }),
      row({ estimated_usd: null, total_tokens: null }),
    ];
    const { metrics } = evaluateGeminiUsage(rows, THRESHOLDS);
    expect(metrics.totalUsd).toBeCloseTo(12.5, 6);
    expect(metrics.eventCount).toBe(2);
  });

  it("calibratedUsd equals totalUsd while the multiplier is the default no-op", () => {
    const rows = [
      row({ estimated_usd: 5, grounding_enabled: true }),
      row({ estimated_usd: 7, grounding_enabled: false }),
    ];
    const { metrics } = evaluateGeminiUsage(rows, THRESHOLDS);
    expect(metrics.calibratedUsd).toBeCloseTo(metrics.totalUsd, 6);
    expect(metrics.totalUsd).toBeCloseTo(12, 6);
  });
});
