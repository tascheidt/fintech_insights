import { describe, it, expect } from "vitest";
import { buildJudgePrompt, combineSwapped, parseJudgeVerdict, winRate, type JudgeVerdict } from "./judge";

function verdict(over: Partial<JudgeVerdict> = {}): JudgeVerdict {
  return {
    criteria: { faithfulness: "A", specificity: "A", instruction_following: "tie", voice: "tie" },
    overall: "A",
    issues_A: [],
    issues_B: ["vague"],
    major_issues_A: 0,
    major_issues_B: 1,
    rationale: "A is grounded.",
    ...over,
  };
}

describe("parseJudgeVerdict", () => {
  it("parses fenced JSON and normalizes sides", () => {
    const v = parseJudgeVerdict('```json\n{"criteria":{"faithfulness":"b","specificity":"A"},"overall":"B","major_issues_A":2}\n```');
    expect(v?.overall).toBe("B");
    expect(v?.criteria.faithfulness).toBe("B");
    expect(v?.criteria.voice).toBe("tie");
    expect(v?.major_issues_A).toBe(2);
  });

  it("returns null for unusable text", () => {
    expect(parseJudgeVerdict("no json here")).toBeNull();
    expect(parseJudgeVerdict('{"criteria":{}}')).toBeNull();
  });
});

describe("combineSwapped", () => {
  it("counts a win only when both orders agree", () => {
    // Candidate was A in the first pass and B in the second; both prefer it.
    const r = combineSwapped(verdict({ overall: "A" }), verdict({ overall: "B", criteria: { faithfulness: "B", specificity: "B", instruction_following: "tie", voice: "tie" } }));
    expect(r.outcome).toBe("win");
    expect(r.criteria.faithfulness).toBe("win");
    expect(r.positionSensitive).toBe(false);
  });

  it("turns position-biased verdicts into a tie", () => {
    // The judge picked "A" both times, i.e. it preferred whichever came first.
    const r = combineSwapped(verdict({ overall: "A" }), verdict({ overall: "A" }));
    expect(r.outcome).toBe("tie");
    expect(r.positionSensitive).toBe(true);
  });

  it("maps major-issue counts back to the right model", () => {
    const r = combineSwapped(
      verdict({ major_issues_A: 0, major_issues_B: 2 }),
      verdict({ major_issues_A: 2, major_issues_B: 0 })
    );
    expect(r.candidateMajorIssues).toBe(0);
    expect(r.baselineMajorIssues).toBe(2);
  });
});

describe("winRate", () => {
  it("scores ties as half", () => {
    const w = combineSwapped(verdict({ overall: "A" }), verdict({ overall: "B" }));
    const t = combineSwapped(verdict({ overall: "A" }), verdict({ overall: "A" }));
    expect(winRate([w, t])).toBe(0.75);
    expect(winRate([])).toBe(0);
  });
});

describe("buildJudgePrompt", () => {
  it("includes both outputs and marks voice n/a on internal surfaces", () => {
    const p = buildJudgePrompt({ surfaceLabel: "Triage", rubric: "r", userFacing: false, sourceInput: "src", outputA: "AAA", outputB: "BBB" });
    expect(p).toContain("AAA");
    expect(p).toContain("BBB");
    expect(p).toContain('answer "tie"');
  });
});
