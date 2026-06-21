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
