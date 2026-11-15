import { describe, it, expect } from "vitest";
import { diffCatalog, isTextGenerationModel, normalizeCatalogEntry } from "./model-catalog";

describe("normalizeCatalogEntry", () => {
  it("strips the models/ prefix and tolerates missing fields", () => {
    const m = normalizeCatalogEntry({ name: "models/example-model", supportedGenerationMethods: ["generateContent"] });
    expect(m.id).toBe("example-model");
    expect(m.inputTokenLimit).toBeNull();
    expect(m.thinking).toBeNull();
  });
});

describe("isTextGenerationModel", () => {
  const base = { displayName: null, version: null, description: null, inputTokenLimit: null, outputTokenLimit: null, thinking: null };
  it("keeps text models and drops embeddings / media", () => {
    expect(isTextGenerationModel({ ...base, id: "gemini-x-latest", supportedGenerationMethods: ["generateContent"] })).toBe(true);
    expect(isTextGenerationModel({ ...base, id: "gemini-embedding-001", supportedGenerationMethods: ["embedContent"] })).toBe(false);
    expect(isTextGenerationModel({ ...base, id: "gemini-x-image", supportedGenerationMethods: ["generateContent"] })).toBe(false);
  });
});

describe("diffCatalog", () => {
  const prev = { capturedAt: "t0", models: ["a", "b"], aliases: { "x-latest": "a-001", "y-latest": "b-001" } };

  it("reports added, removed and rotated", () => {
    const d = diffCatalog(prev, { capturedAt: "t1", models: ["b", "c"], aliases: { "x-latest": "c-001", "y-latest": "b-001" } });
    expect(d.added).toEqual(["c"]);
    expect(d.removed).toEqual(["a"]);
    expect(d.rotated).toEqual([{ alias: "x-latest", from: "a-001", to: "c-001" }]);
    expect(d.changed).toBe(true);
  });

  it("does not treat a failed probe as a rotation", () => {
    const d = diffCatalog(prev, { capturedAt: "t1", models: ["a", "b"], aliases: { "x-latest": null, "y-latest": "b-001" } });
    expect(d.changed).toBe(false);
  });
});
