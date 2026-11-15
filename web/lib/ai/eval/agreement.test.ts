import { describe, it, expect } from "vitest";
import { jaccard, diceCoefficient, scoreExtraction, scoreCategorization } from "./agreement";
import type { JobStructureForDB } from "@/lib/analysis/structure";
import type { JobCategoryResult } from "@/lib/analysis/categorizer";

function struct(over: Partial<JobStructureForDB> = {}): JobStructureForDB {
  return {
    summary: "Backend engineer working on payments rails.",
    seniority_level: "senior",
    salary_min: 120000,
    salary_max: 150000,
    salary_currency: "USD",
    tech_stack: ["Go", "PostgreSQL", "Kafka"],
    keywords: ["payments", "backend"],
    standardized_department: "Engineering",
    function_category: "engineering-backend",
    location_structured: { city: "Toronto", state: "Ontario", country: "Canada", formatted: "Toronto, Canada" },
    ...over,
  };
}

describe("jaccard", () => {
  it("is 1 for identical sets and 1 for both-empty", () => {
    expect(jaccard(["a", "b"], ["b", "a"])).toBe(1);
    expect(jaccard([], [])).toBe(1);
  });
  it("is case-insensitive and computes overlap", () => {
    expect(jaccard(["AWS", "Go"], ["aws", "rust"])).toBeCloseTo(1 / 3, 6);
  });
});

describe("diceCoefficient", () => {
  it("is 1 for identical text and 0 for disjoint", () => {
    expect(diceCoefficient("hello world", "hello world")).toBe(1);
    expect(diceCoefficient("alpha", "beta")).toBe(0);
  });
});

describe("scoreExtraction", () => {
  it("scores identical extractions as 100% L1", () => {
    const a = scoreExtraction(struct(), struct());
    expect(a.l1Agreement).toBe(1);
    expect(a.summarySimilarity).toBe(1);
  });

  it("penalizes a wrong enum and partial tech overlap", () => {
    const candidate = struct({
      seniority_level: "mid", // wrong
      tech_stack: ["Go", "MySQL"], // 1/4 overlap vs Go/PostgreSQL/Kafka
    });
    const a = scoreExtraction(candidate, struct());
    const fieldScore = (name: string) => a.fields.find((f) => f.field === name)!.score;
    expect(fieldScore("seniority_level")).toBe(0);
    expect(fieldScore("function_category")).toBe(1);
    expect(fieldScore("tech_stack")).toBeCloseTo(1 / 4, 6);
    expect(a.l1Agreement).toBeGreaterThan(0);
    expect(a.l1Agreement).toBeLessThan(1);
  });

  it("treats both-null salary/location as agreement", () => {
    const noExtras = struct({ salary_min: null, salary_max: null, location_structured: null });
    const a = scoreExtraction(noExtras, noExtras);
    expect(a.fields.find((f) => f.field === "salary")!.score).toBe(1);
    expect(a.fields.find((f) => f.field === "location")!.score).toBe(1);
  });
});

describe("scoreCategorization", () => {
  const cat = (over: Partial<JobCategoryResult> = {}): JobCategoryResult => ({
    role_category: "engineering-backend",
    extracted_sections: {
      summary: "x",
      responsibilities: ["a"],
      requirements: ["b"],
      nice_to_have: [],
      benefits: ["c"],
    },
    quality_score: 4,
    ...over,
  });

  it("is full agreement when identical", () => {
    const a = scoreCategorization(cat(), cat());
    expect(a.roleCategoryMatch).toBe(1);
    expect(a.sectionsScore).toBe(1);
    expect(a.qualityAgreement).toBe(1);
  });

  it("flags a category mismatch and quality delta", () => {
    const a = scoreCategorization(cat({ role_category: "data-science", quality_score: 2 }), cat());
    expect(a.roleCategoryMatch).toBe(0);
    expect(a.overall).toBe(0);
    expect(a.qualityAgreement).toBeCloseTo(1 - 2 / 4, 6);
  });
});

describe("scoreAgainstGolden", () => {
  const golden: import("./agreement").GoldenExtractionRecord = {
    jobId: "j1",
    expected: {
      seniority_level: "senior",
      standardized_department: "Engineering",
      function_category: "engineering-data",
      salary: { min: 100000, max: 120000, currency: "CAD" },
      location: { city: "Toronto", country: "Canada" },
      tech_required: [["Oracle", "Oracle Database"], "Terraform"],
      tech_allowed: ["SQL"],
    },
    acceptable: { seniority_level: ["staff"], function_category: ["engineering-platform-sre-devops"] },
  };
  const base = {
    summary: "s",
    seniority_level: "senior",
    salary_min: 100000,
    salary_max: 120000,
    salary_currency: "CAD",
    tech_stack: ["Oracle Database", "Terraform", "SQL"],
    keywords: [],
    standardized_department: "Engineering",
    function_category: "engineering-data",
    location_structured: { city: "Toronto", state: "Ontario", country: "Canada", formatted: "Toronto" },
  } as unknown as JobStructureForDB;

  it("scores a fully correct extraction as 1", async () => {
    const { scoreAgainstGolden } = await import("./agreement");
    const s = scoreAgainstGolden(base, golden);
    expect(s.l1Correctness).toBe(1);
    expect(s.techUnexpected).toEqual([]);
  });

  it("accepts listed alternatives and penalizes everything else", async () => {
    const { scoreAgainstGolden } = await import("./agreement");
    const alt = scoreAgainstGolden({ ...base, seniority_level: "staff", function_category: "engineering-platform-sre-devops" } as JobStructureForDB, golden);
    expect(alt.l1Correctness).toBe(1);
    const wrong = scoreAgainstGolden({ ...base, seniority_level: "junior" } as JobStructureForDB, golden);
    expect(wrong.fields.find((f) => f.field === "seniority_level")?.score).toBe(0);
  });

  it("counts excluded/inferred tech against precision and missing required against recall", async () => {
    const { scoreAgainstGolden } = await import("./agreement");
    const s = scoreAgainstGolden({ ...base, tech_stack: ["Oracle", "Jira", "Slack"] } as JobStructureForDB, golden);
    expect(s.techRecall).toBe(0.5);
    expect(s.techPrecision).toBeCloseTo(1 / 3);
    expect(s.techUnexpected).toEqual(["Jira", "Slack"]);
  });

  it("treats an inferred salary as wrong when none is published", async () => {
    const { scoreAgainstGolden } = await import("./agreement");
    const g = { ...golden, expected: { ...golden.expected, salary: null } };
    expect(scoreAgainstGolden(base, g).fields.find((f) => f.field === "salary")?.score).toBe(0);
    const none = { ...base, salary_min: null, salary_max: null } as JobStructureForDB;
    expect(scoreAgainstGolden(none, g).fields.find((f) => f.field === "salary")?.score).toBe(1);
  });

  it("normalizes country aliases", async () => {
    const { scoreAgainstGolden } = await import("./agreement");
    const g = { ...golden, expected: { ...golden.expected, location: { city: "New York", country: "United States" } } };
    const c = { ...base, location_structured: { city: "New York", state: "NY", country: "United States of America", formatted: "" } } as JobStructureForDB;
    expect(scoreAgainstGolden(c, g).fields.find((f) => f.field === "location")?.score).toBe(1);
  });
});
