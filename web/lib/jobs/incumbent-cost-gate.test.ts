/**
 * Tests for the incumbent-tier AI cost gate.
 *
 * The gate decides whether `analyzeJobAdvanced` (Pro+grounded — the most
 * expensive call in the ingestion path) runs for a given job. Mistakes are
 * costly in both directions: false negatives waste Gemini spend; false
 * positives drop signal we'd want from a Staff AI hire at RBC.
 */

import { describe, expect, it } from "vitest";
import {
  decideIncumbentGate,
  INCUMBENT_ANALYZE_FUNCTION_WHITELIST,
  INCUMBENT_ANALYZE_SENIORITY_WHITELIST,
} from "./incumbent-cost-gate";

describe("decideIncumbentGate", () => {
  describe("fintech tier", () => {
    it("always analyzes regardless of seniority/function — fintech is the platform's core subject", () => {
      const decision = decideIncumbentGate({
        tier: "fintech",
        seniority_level: "junior",
        function_category: "engineering-backend",
      });
      expect(decision.shouldAnalyze).toBe(true);
      expect(decision.reason).toBe("fintech_tier_always_analyzes");
    });

    it("analyzes a fintech job even when structured fields are missing (Flash extraction may still be pending)", () => {
      const decision = decideIncumbentGate({
        tier: "fintech",
        seniority_level: null,
        function_category: null,
      });
      expect(decision.shouldAnalyze).toBe(true);
    });
  });

  describe("incumbent tier — the cost win", () => {
    it("skips when structure is missing (no seniority/function yet — would be analyzing blind)", () => {
      const decision = decideIncumbentGate({
        tier: "incumbent",
        seniority_level: null,
        function_category: null,
      });
      expect(decision.shouldAnalyze).toBe(false);
      expect(decision.reason).toBe("incumbent_missing_structure");
    });

    it("skips a junior incumbent role in AI/ML — bar is staff+, not just function", () => {
      const decision = decideIncumbentGate({
        tier: "incumbent",
        seniority_level: "junior",
        function_category: "engineering-ai-ml",
      });
      expect(decision.shouldAnalyze).toBe(false);
      expect(decision.reason).toBe("incumbent_seniority_below_bar");
    });

    it("skips a senior incumbent role — senior is below the bar (bar is staff+ for incumbents)", () => {
      const decision = decideIncumbentGate({
        tier: "incumbent",
        seniority_level: "senior",
        function_category: "engineering-ai-ml",
      });
      expect(decision.shouldAnalyze).toBe(false);
    });

    it("skips a staff-level engineer in a non-whitelisted function (e.g. backend, not AI/ML)", () => {
      const decision = decideIncumbentGate({
        tier: "incumbent",
        seniority_level: "staff",
        function_category: "engineering-backend",
      });
      expect(decision.shouldAnalyze).toBe(false);
      expect(decision.reason).toBe("incumbent_function_not_whitelisted");
    });

    it("ANALYZES a Staff AI/ML engineer at an incumbent — this is the canonical signal we want", () => {
      const decision = decideIncumbentGate({
        tier: "incumbent",
        seniority_level: "staff",
        function_category: "engineering-ai-ml",
      });
      expect(decision.shouldAnalyze).toBe(true);
      expect(decision.reason).toBe("incumbent_high_signal_role");
    });

    it("ANALYZES a Principal Data Scientist at an incumbent", () => {
      const decision = decideIncumbentGate({
        tier: "incumbent",
        seniority_level: "principal",
        function_category: "data-science",
      });
      expect(decision.shouldAnalyze).toBe(true);
    });

    it("ANALYZES an executive compliance hire at an incumbent (regulatory posture signal)", () => {
      const decision = decideIncumbentGate({
        tier: "incumbent",
        seniority_level: "executive",
        function_category: "compliance",
      });
      expect(decision.shouldAnalyze).toBe(true);
    });

    it("ANALYZES an AML/financial-crime lead at an incumbent", () => {
      const decision = decideIncumbentGate({
        tier: "incumbent",
        seniority_level: "lead",
        function_category: "aml-financial-crime",
      });
      expect(decision.shouldAnalyze).toBe(true);
    });
  });

  describe("whitelist constants", () => {
    it("seniority whitelist is staff+ only — by design, no senior/mid/junior", () => {
      expect([...INCUMBENT_ANALYZE_SENIORITY_WHITELIST]).toEqual([
        "staff",
        "principal",
        "lead",
        "executive",
      ]);
    });

    it("function whitelist excludes generic engineering, GTM, ops — only signal-bearing categories", () => {
      const list = [...INCUMBENT_ANALYZE_FUNCTION_WHITELIST];
      expect(list).toContain("engineering-ai-ml");
      expect(list).toContain("data-science");
      expect(list).toContain("compliance");
      expect(list).not.toContain("engineering-backend");
      expect(list).not.toContain("sales");
      expect(list).not.toContain("operations");
    });
  });

  describe("regression: every fintech job analyzes — no surprise cost gate kicks in", () => {
    // Exhaustive matrix: fintech tier should ALWAYS analyze across the
    // full seniority enum + a sample of function categories. The gate
    // must never accidentally apply incumbent rules to fintech jobs.
    const senioritiesToCheck = [
      "intern", "junior", "mid", "senior", "staff", "principal", "lead", "executive",
    ];
    const functionsToCheck = [
      "engineering-backend",
      "engineering-ai-ml",
      "product-management",
      "sales",
      "operations-strategy",
      "risk-management",
    ];
    for (const s of senioritiesToCheck) {
      for (const f of functionsToCheck) {
        it(`fintech + ${s} + ${f} → analyze`, () => {
          expect(
            decideIncumbentGate({
              tier: "fintech",
              seniority_level: s,
              function_category: f,
            }).shouldAnalyze
          ).toBe(true);
        });
      }
    }
  });
});
