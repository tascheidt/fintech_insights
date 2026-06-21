import { describe, it, expect } from "vitest";
import { mapOpenAiUsage } from "./openai-compat";
import { recordUsage } from "@/lib/ai/gemini-meter";

describe("mapOpenAiUsage", () => {
  it("maps OpenAI usage onto the gemini-meter shape", () => {
    const m = mapOpenAiUsage({ prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 });
    expect(m.promptTokenCount).toBe(1200);
    expect(m.candidatesTokenCount).toBe(300);
    expect(m.totalTokenCount).toBe(1500);
    expect(m.thoughtsTokenCount).toBeUndefined();
  });

  it("surfaces reasoning tokens when reported", () => {
    const m = mapOpenAiUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 200,
      completion_tokens_details: { reasoning_tokens: 50 },
    });
    expect(m.thoughtsTokenCount).toBe(50);
  });

  it("defaults to zeros on missing usage", () => {
    const m = mapOpenAiUsage(undefined);
    expect(m.promptTokenCount).toBe(0);
    expect(m.candidatesTokenCount).toBe(0);
    expect(m.totalTokenCount).toBe(0);
  });

  it("feeds estimateUsd via recordUsage for a priced eval model", () => {
    const usage = mapOpenAiUsage({ prompt_tokens: 1_000_000, completion_tokens: 1_000_000, total_tokens: 2_000_000 });
    const rec = recordUsage({
      callSite: "test",
      modelRequested: "deepseek-v4-flash",
      modelServed: "deepseek-v4-flash",
      groundingEnabled: false,
      usageMetadata: usage,
      latencyMs: 10,
      status: "ok",
    });
    // 1M input @ $0.14 + 1M output @ $0.28 = $0.42
    expect(rec.estimatedUsd).toBeCloseTo(0.42, 6);
  });
});
