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
    expect(resolveProvider("glm-5.2")).toBe("fireworks");
    expect(resolveProvider("deepseek-v4-flash")).toBe("fireworks");
  });

  it("identifies eval models", () => {
    expect(isEvalModel("glm-5.2")).toBe(true);
    expect(isEvalModel("gemini-flash-latest")).toBe(false);
    expect(EVAL_MODEL_IDS).toContain("glm-5.2");
    expect(EVAL_MODEL_IDS).toContain("deepseek-v4-flash");
  });

  it("resolves the provider-native model path with env override", () => {
    const spec = getEvalModelSpec("glm-5.2");
    expect(spec).not.toBeNull();
    expect(resolveProviderModel(spec!)).toBe("accounts/fireworks/models/glm-5p2");
    process.env.FIREWORKS_GLM_MODEL = "accounts/fireworks/models/glm-5p2-custom";
    expect(resolveProviderModel(spec!)).toBe("accounts/fireworks/models/glm-5p2-custom");
  });
});
