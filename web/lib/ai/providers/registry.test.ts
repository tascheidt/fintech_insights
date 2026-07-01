import { describe, it, expect, afterEach } from "vitest";
import {
  resolveProvider,
  isEvalModel,
  getEvalModelSpec,
  resolveProviderModel,
  EVAL_MODEL_IDS,
} from "./registry";

describe("eval model registry", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("routes Gemini ids to the gemini provider (production path untouched)", () => {
    expect(resolveProvider("gemini-flash-latest")).toBe("gemini");
    expect(resolveProvider("gemini-pro-latest")).toBe("gemini");
    // Unknown ids default to gemini so nothing accidentally hits an open model.
    expect(resolveProvider("some-future-model")).toBe("gemini");
  });

  it("routes registered eval ids to fireworks", () => {
    expect(resolveProvider("qwen3-30b-a3b")).toBe("fireworks");
    expect(resolveProvider("deepseek-v4-flash")).toBe("fireworks");
  });

  it("identifies eval models", () => {
    expect(isEvalModel("qwen3-30b-a3b")).toBe(true);
    expect(isEvalModel("gemini-flash-latest")).toBe(false);
    expect(EVAL_MODEL_IDS).toContain("qwen3-30b-a3b");
    expect(EVAL_MODEL_IDS).toContain("deepseek-v4-flash");
  });

  it("resolves the provider-native model path with env override", () => {
    const spec = getEvalModelSpec("qwen3-30b-a3b");
    expect(spec).not.toBeNull();
    expect(resolveProviderModel(spec!)).toBe("accounts/fireworks/models/qwen3-30b-a3b");
    process.env.FIREWORKS_QWEN3_30B_MODEL = "accounts/fireworks/models/qwen3-30b-a3b-custom";
    expect(resolveProviderModel(spec!)).toBe("accounts/fireworks/models/qwen3-30b-a3b-custom");
  });
});
