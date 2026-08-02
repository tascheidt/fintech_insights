/**
 * Feedback triage guardrails.
 *
 * The functions under test are the layer between what Gemini returns and what
 * reaches the database. They are pure on purpose: the failure this engine
 * replaces was not a bad model call, it was the absence of any policy between
 * the model and `UPDATE feedback_submissions`.
 *
 * The centrepiece is the Revolut regression. On 2026-05-25 two users reported
 * that the Revolut scraper had stopped returning roles. The old engine declined
 * both at confidence 9 and 10 as duplicates of "#2" — a positional index into a
 * prompt list that referenced nothing real — and the admin UI hides accept and
 * decline controls once status is 'declined', so neither was ever recoverable.
 * A scraper going quietly dark is the exact failure mode the weekly drift check
 * exists to catch; these reports were the product's own early warning, thrown
 * away by its triage.
 */

import { describe, it, expect } from "vitest";
import {
  buildTriagePrompt,
  clampConfidence,
  enforceTriagePolicy,
  finalizeTriage,
  parseTriageJson,
  sanitizeDuplicate,
  type DuplicateCandidate,
  type TriageSubmission,
} from "./feedback-triage";

const CANDIDATES: DuplicateCandidate[] = [
  {
    id: "a279d82d-ff8f-4a11-9ce7-f47f9a40cca3",
    title: "Add Revolut Canada roles to the fintech scraping",
    triage_decision: "yes",
    status: "accepted",
    github_issue_number: 89,
  },
  {
    id: "c13cb494-bc06-482d-a09a-a1215af6876a",
    title: "Have a job that detects if a scraper is broken",
    triage_decision: "yes",
    status: "accepted",
    github_issue_number: 79,
  },
];

const REVOLUT_BUG: TriageSubmission = {
  id: "743fc99a-59b4-428e-ac27-d64a2b944f85",
  type: "bug",
  title: "Revolut scraper does not seem to be working",
  description:
    "The Revolut company page has been showing no new roles for a while now, but their careers site clearly has openings.",
  page_url: "/companies/revolut",
};

describe("clampConfidence", () => {
  it.each([
    [7, 7],
    [7.5, 8],
    [0, 1],
    [11, 10],
    [-3, 1],
  ])("maps %s to %s", (input, expected) => {
    expect(clampConfidence(input)).toBe(expected);
  });

  it("falls back to 5 for non-numeric output", () => {
    expect(clampConfidence("high")).toBe(5);
    expect(clampConfidence(null)).toBe(5);
    expect(clampConfidence(Number.NaN)).toBe(5);
  });

  it("always satisfies the DB CHECK (integer between 1 and 10)", () => {
    for (const raw of [-100, 0, 0.4, 1, 5.5, 10, 10.6, 999, Number.NaN]) {
      const v = clampConfidence(raw);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(10);
    }
  });
});

describe("sanitizeDuplicate", () => {
  it("keeps an id that was actually offered", () => {
    const { duplicateOf, note } = sanitizeDuplicate(CANDIDATES[0].id, CANDIDATES);
    expect(duplicateOf).toBe(CANDIDATES[0].id);
    expect(note).toBeNull();
  });

  it('drops the positional "#2" that production is full of', () => {
    const { duplicateOf, note } = sanitizeDuplicate("#2", CANDIDATES);
    expect(duplicateOf).toBeNull();
    expect(note).toContain("not in the candidate set");
  });

  it("drops a hallucinated UUID that was never offered", () => {
    const { duplicateOf } = sanitizeDuplicate(
      "00000000-0000-4000-8000-000000000000",
      CANDIDATES
    );
    expect(duplicateOf).toBeNull();
  });

  it.each([null, undefined, "", "null", 42])("treats %s as no duplicate", (raw) => {
    expect(sanitizeDuplicate(raw, CANDIDATES).duplicateOf).toBeNull();
  });
});

describe("enforceTriagePolicy", () => {
  it("REGRESSION: a bug declined as a duplicate survives as maybe, link intact", () => {
    const { decision, policyNotes } = enforceTriagePolicy({
      type: "bug",
      decision: "no",
      confidence: 10,
      mappedPriority: null,
      duplicateOf: CANDIDATES[0].id,
      reasoning: "This is a duplicate of the existing Revolut scraping request.",
    });

    expect(decision).toBe("maybe");
    expect(policyNotes.join(" ")).toContain("cross-reference is not a verdict");
  });

  it("REGRESSION: a bug cannot be declined on priority or scope grounds", () => {
    const { decision, policyNotes } = enforceTriagePolicy({
      type: "bug",
      decision: "no",
      confidence: 9,
      mappedPriority: null,
      duplicateOf: null,
      reasoning: "Scraper coverage is not a current product priority.",
    });

    expect(decision).toBe("maybe");
    expect(policyNotes.join(" ")).toContain("defect rubric forbids");
  });

  it("still allows a bug to be declined on the merits", () => {
    const { decision, policyNotes } = enforceTriagePolicy({
      type: "bug",
      decision: "no",
      confidence: 9,
      mappedPriority: null,
      duplicateOf: null,
      reasoning: "The described behaviour is intended: inactive roles are hidden by default.",
    });

    expect(decision).toBe("no");
    expect(policyNotes).toHaveLength(0);
  });

  it("does NOT apply the priority gate to bugs", () => {
    const { decision } = enforceTriagePolicy({
      type: "bug",
      decision: "yes",
      confidence: 9,
      mappedPriority: null,
      duplicateOf: null,
      reasoning: "Specific, observable, and actionable.",
    });
    expect(decision).toBe("yes");
  });

  it("does apply the priority gate to feature requests", () => {
    const { decision, policyNotes } = enforceTriagePolicy({
      type: "feature",
      decision: "yes",
      confidence: 9,
      mappedPriority: null,
      duplicateOf: null,
      reasoning: "Nice idea.",
    });
    expect(decision).toBe("maybe");
    expect(policyNotes.join(" ")).toContain("no mapped product priority");
  });

  it("downgrades a low-confidence yes regardless of type", () => {
    for (const type of ["bug", "feature"]) {
      const { decision } = enforceTriagePolicy({
        type,
        decision: "yes",
        confidence: 6,
        mappedPriority: "1. Deeper company-level hiring analytics",
        duplicateOf: null,
        reasoning: "Probably worth doing.",
      });
      expect(decision).toBe("maybe");
    }
  });

  it("leaves a well-supported product yes alone", () => {
    const { decision, policyNotes } = enforceTriagePolicy({
      type: "feature",
      decision: "yes",
      confidence: 9,
      mappedPriority: "3. Better job categorization",
      duplicateOf: null,
      reasoning: "Maps cleanly to an existing priority.",
    });
    expect(decision).toBe("yes");
    expect(policyNotes).toHaveLength(0);
  });
});

describe("finalizeTriage", () => {
  it("REGRESSION: reproduces the Revolut decline end-to-end and rescues it", () => {
    // Verbatim shape of what the old engine acted on: decline, high confidence,
    // duplicate pointing at a positional index.
    const result = finalizeTriage(REVOLUT_BUG, CANDIDATES, {
      decision: "no",
      confidence: 9,
      reasoning: "Duplicate of the existing Revolut request; not a current priority.",
      mapped_priority: null,
      duplicate_of: "#2",
      suggested_title: "Revolut scraper returning no roles",
      suggested_labels: ["bug", "scraper"],
      issue_markdown: "# Revolut scraper returning no roles\n\n## TL;DR\nNo roles since Monday.",
    });

    // The phantom link is discarded rather than stored...
    expect(result.duplicate_of).toBeNull();
    // ...and because the decline rested on priority grounds, the bug survives.
    expect(result.decision).toBe("maybe");
    // An issue body is retained so an admin can ship it without re-running triage.
    expect(result.issue_markdown).not.toBeNull();
    expect(result.policy_notes.length).toBeGreaterThan(0);
  });

  it("keeps a genuine duplicate link while classifying on the merits", () => {
    const result = finalizeTriage(REVOLUT_BUG, CANDIDATES, {
      decision: "no",
      confidence: 8,
      reasoning: "Same underlying report as the earlier submission.",
      mapped_priority: null,
      duplicate_of: CANDIDATES[0].id,
      suggested_title: "Revolut scraper returning no roles",
      suggested_labels: [],
      issue_markdown: "# Revolut scraper returning no roles",
    });

    expect(result.duplicate_of).toBe(CANDIDATES[0].id);
    expect(result.decision).toBe("maybe");
  });

  it("drops the issue body only on a surviving decline", () => {
    const result = finalizeTriage(
      { ...REVOLUT_BUG, type: "feature" },
      CANDIDATES,
      {
        decision: "no",
        confidence: 9,
        reasoning: "Out of scope for fintech hiring intelligence.",
        mapped_priority: null,
        duplicate_of: null,
        suggested_title: "Make everything pink",
        suggested_labels: [],
        issue_markdown: "# Make everything pink",
      }
    );
    expect(result.decision).toBe("no");
    expect(result.issue_markdown).toBeNull();
  });

  it("falls back to the user's own title when the model omits one", () => {
    const result = finalizeTriage(REVOLUT_BUG, CANDIDATES, {
      decision: "maybe",
      confidence: 5,
      reasoning: "Needs more detail.",
      mapped_priority: null,
      duplicate_of: null,
      suggested_title: "   ",
      suggested_labels: [],
      issue_markdown: null,
    });
    expect(result.suggested_title).toBe(REVOLUT_BUG.title);
  });

  it("strips empty labels", () => {
    const result = finalizeTriage(REVOLUT_BUG, CANDIDATES, {
      decision: "maybe",
      confidence: 5,
      reasoning: "ok",
      mapped_priority: null,
      duplicate_of: null,
      suggested_title: "t",
      suggested_labels: ["bug", "", "   ", "scraper"],
      issue_markdown: null,
    });
    expect(result.suggested_labels).toEqual(["bug", "scraper"]);
  });
});

describe("parseTriageJson", () => {
  it("parses bare JSON", () => {
    expect(parseTriageJson('{"decision":"yes"}')).toEqual({ decision: "yes" });
  });

  it("parses a fenced block", () => {
    expect(parseTriageJson('```json\n{"decision":"no"}\n```')).toEqual({
      decision: "no",
    });
  });

  it("recovers from a trailing comma", () => {
    expect(parseTriageJson('{"decision":"maybe",}')).toEqual({ decision: "maybe" });
  });

  it("parses JSON embedded in prose", () => {
    expect(parseTriageJson('Here you go:\n{"decision":"yes"}\nHope that helps.')).toEqual({
      decision: "yes",
    });
  });

  it("returns null when there is no JSON at all", () => {
    expect(parseTriageJson("I could not complete this request.")).toBeNull();
  });
});

describe("buildTriagePrompt", () => {
  it("gives bugs the defect rubric and never the priority gate", () => {
    const prompt = buildTriagePrompt(REVOLUT_BUG, CANDIDATES);
    expect(prompt).toContain("This submission is a BUG REPORT");
    expect(prompt).toContain("Roadmap priority is IRRELEVANT here");
    expect(prompt).not.toContain("This submission is a PRODUCT REQUEST");
  });

  it("gives feature requests the product rubric", () => {
    const prompt = buildTriagePrompt({ ...REVOLUT_BUG, type: "feature" }, CANDIDATES);
    expect(prompt).toContain("This submission is a PRODUCT REQUEST");
    expect(prompt).not.toContain("This submission is a BUG REPORT");
  });

  it("emits real UUIDs for candidates and never positional indices", () => {
    const prompt = buildTriagePrompt(REVOLUT_BUG, CANDIDATES);
    for (const c of CANDIDATES) expect(prompt).toContain(c.id);
    // The old prompt rendered "- #1: <title>" / "- #2: <title>".
    expect(prompt).not.toMatch(/^- #\d+:/m);
  });

  it("surfaces prior verdicts so a rejected idea is not silently re-litigated", () => {
    const prompt = buildTriagePrompt(REVOLUT_BUG, [
      { ...CANDIDATES[0], triage_decision: "no", status: "declined" },
    ]);
    expect(prompt).toContain("prior_verdict: no");
  });

  it("handles an empty candidate set", () => {
    const prompt = buildTriagePrompt(REVOLUT_BUG, []);
    expect(prompt).toContain("No prior submissions to compare against");
  });
});
