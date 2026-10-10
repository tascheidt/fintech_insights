import { describe, expect, it, vi } from "vitest";
import {
  assertDigestGenerationFinished,
  buildDigestCommentaryFallback,
  generateCompleteDigestCopy,
  isCompleteDigestProse,
  parseDigestCommentaryResponse,
  parseDigestGlobalSummaryResponse,
} from "./digest-copy";
import { WEEKLY_DIGEST_BENCHMARKS } from "../labs/prompt-forge-benchmarks";

const valid = {
  headline: "Wealthsimple adds partnerships and estate planning openings",
  body: 'The postings include a "Senior Lead, Partnerships (Perks & Rewards)" and an Estate Planning Specialist.',
  new_signal: 'A "Senior Lead, Partnerships (Perks & Rewards)" opening adds a client benefits focus.',
};

describe("digest publication contract", () => {
  it("preserves escaped job-title quotes with complete JSON", () => {
    expect(parseDigestCommentaryResponse(JSON.stringify(valid))).toEqual(valid);
    expect(parseDigestCommentaryResponse(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``)).toEqual(valid);
  });

  it.each([
    '{"headline":"Wealthsimple adds partnerships roles","body":"The company also posted an Estate Planning Specialist, while infrastructure and',
    '{"headline":"EQ Bank opens leadership searches","body":"Five listings target senior management, led by mandates including \\"Director',
    `${JSON.stringify(valid).slice(0, -1)}`,
  ])("rejects partial JSON instead of salvaging a fragment", (text) => {
    expect(() => parseDigestCommentaryResponse(text)).toThrow();
  });

  it.each([
    "The company listed infrastructure and",
    "The company listed infrastructure and.",
    "The company listed infrastructure and. It also added risk roles.",
    "Five listings target leadership, including",
    'Five listings include "Director.',
    "Hiring spans infrastructure…",
    "Hiring spans infrastructure...",
    "Hiring spans infrastructure,",
    "Hiring spans (infrastructure.",
    'The company listed a \\"Director\\" role.',
  ])("rejects unfinished prose even in syntactically valid JSON: %s", (body) => {
    expect(isCompleteDigestProse(body)).toBe(false);
    expect(() => parseDigestCommentaryResponse(JSON.stringify({ ...valid, body }))).toThrow();
  });

  it("accepts punctuation around quotes, parentheses, abbreviations, and decimals", () => {
    for (const body of [
      valid.body,
      'The new title is "Sr. Director, Credit Risk."',
      "The company added a credit risk role (a senior director).",
      "The title names a Sr. Director, with 2.5 years of experience required.",
      "One role concerns R&D.",
    ]) expect(isCompleteDigestProse(body)).toBe(true);
  });

  it.each([null, [], { headline: 12, body: valid.body }, { headline: valid.headline, body: {} }])(
    "rejects invalid field types instead of stringifying them", (response) => {
      expect(() => parseDigestCommentaryResponse(JSON.stringify(response))).toThrow();
    }
  );

  it("validates signal, key insight, and watch-item sentences as well as the body", () => {
    expect(() => parseDigestCommentaryResponse(JSON.stringify({ ...valid, new_signal: "Roles include" }))).toThrow();
    const global = { headline: valid.headline, key_insight: "Risk roles span two companies.", body: valid.body, watching: null };
    expect(parseDigestGlobalSummaryResponse(JSON.stringify(global))).toEqual(global);
    for (const field of ["body", "key_insight", "watching"]) {
      expect(() => parseDigestGlobalSummaryResponse(JSON.stringify({ ...global, [field]: "Roles include" }))).toThrow();
    }
  });

  it("keeps compatibility with older prompts without a signal field", () => {
    expect(parseDigestCommentaryResponse(JSON.stringify({ headline: valid.headline, body: valid.body })).new_signal).toBeNull();
  });

  it("rejects non-natural finish reasons even when the text looks complete", () => {
    expect(() => assertDigestGenerationFinished("STOP")).not.toThrow();
    for (const reason of ["MAX_TOKENS", "SAFETY", "RECITATION", undefined]) {
      expect(() => assertDigestGenerationFinished(reason)).toThrow();
    }
  });

  it("retries rejected copy once and returns the second complete response", async () => {
    const attempts: number[] = [];
    const fallback = vi.fn(() => valid);
    const rejected = vi.fn();
    const result = await generateCompleteDigestCopy(async (attempt) => {
      attempts.push(attempt);
      return parseDigestCommentaryResponse(attempt === 0 ? '{"headline":"Partial"' : JSON.stringify(valid));
    }, fallback, rejected);
    expect(result).toEqual(valid);
    expect(attempts).toEqual([0, 1]);
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("uses complete factual copy after two failures without inventing a new signal", async () => {
    const request = vi.fn(async () => { throw new Error("Truncated response"); });
    const result = await generateCompleteDigestCopy(request,
      () => buildDigestCommentaryFallback(WEEKLY_DIGEST_BENCHMARKS[0].input), () => {});
    expect(request).toHaveBeenCalledTimes(2);
    expect(isCompleteDigestProse(result.body)).toBe(true);
    expect(result.body).toContain(String(WEEKLY_DIGEST_BENCHMARKS[0].input.week_job_count));
    expect(result.new_signal).toBeNull();
  });
});
