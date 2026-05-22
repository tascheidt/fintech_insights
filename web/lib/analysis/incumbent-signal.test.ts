/**
 * Tests for the shared "incumbent signal job" definition.
 *
 * `isIncumbentSignalJob` is the single gate used by the AI cost gate, the
 * Incumbent Bets rail, and the Incumbent Watch digest — if it drifts, all
 * three drift together, so it's worth pinning down precisely.
 */

import { describe, expect, it } from "vitest";
import {
  INCUMBENT_SIGNAL_FUNCTION_CATEGORIES,
  INCUMBENT_SIGNAL_SENIORITY,
  isIncumbentSignalJob,
} from "./incumbent-signal";

describe("isIncumbentSignalJob", () => {
  it("is signal: staff+ seniority AND a whitelisted function", () => {
    expect(
      isIncumbentSignalJob({
        seniority_level: "staff",
        function_category: "engineering-ai-ml",
      })
    ).toBe(true);
    expect(
      isIncumbentSignalJob({
        seniority_level: "principal",
        function_category: "data-science",
      })
    ).toBe(true);
    expect(
      isIncumbentSignalJob({
        seniority_level: "executive",
        function_category: "compliance",
      })
    ).toBe(true);
    expect(
      isIncumbentSignalJob({
        seniority_level: "lead",
        function_category: "aml-financial-crime",
      })
    ).toBe(true);
  });

  it("is NOT signal: senior or below, even in a whitelisted function", () => {
    for (const s of ["intern", "junior", "mid", "senior"]) {
      expect(
        isIncumbentSignalJob({
          seniority_level: s,
          function_category: "engineering-ai-ml",
        })
      ).toBe(false);
    }
  });

  it("is NOT signal: staff+ in a non-whitelisted function", () => {
    expect(
      isIncumbentSignalJob({
        seniority_level: "staff",
        function_category: "engineering-backend",
      })
    ).toBe(false);
    expect(
      isIncumbentSignalJob({
        seniority_level: "executive",
        function_category: "sales",
      })
    ).toBe(false);
  });

  it("is NOT signal when structured fields are missing (unclassified job)", () => {
    expect(
      isIncumbentSignalJob({ seniority_level: null, function_category: null })
    ).toBe(false);
    expect(
      isIncumbentSignalJob({
        seniority_level: "staff",
        function_category: null,
      })
    ).toBe(false);
    expect(
      isIncumbentSignalJob({
        seniority_level: null,
        function_category: "data-science",
      })
    ).toBe(false);
    expect(
      isIncumbentSignalJob({
        seniority_level: undefined,
        function_category: undefined,
      })
    ).toBe(false);
  });
});

describe("whitelist constants", () => {
  it("seniority whitelist is exactly staff+ (no senior/mid/junior/intern)", () => {
    expect([...INCUMBENT_SIGNAL_SENIORITY]).toEqual([
      "staff",
      "principal",
      "lead",
      "executive",
    ]);
  });

  it("function whitelist is the AI/ML, Data, and Risk-AI categories only", () => {
    const list = [...INCUMBENT_SIGNAL_FUNCTION_CATEGORIES];
    expect(list).toContain("engineering-ai-ml");
    expect(list).toContain("data-science");
    expect(list).toContain("data-analytics-bi");
    expect(list).toContain("analytics-engineering");
    expect(list).toContain("risk-management");
    expect(list).toContain("compliance");
    expect(list).toContain("aml-financial-crime");
    // Generic / GTM / ops categories must stay out.
    expect(list).not.toContain("engineering-backend");
    expect(list).not.toContain("sales");
    expect(list).not.toContain("operations");
  });
});
