/**
 * Tests for the pure helpers inside `calibrate-incumbent-gate.ts`.
 *
 * The script itself is a one-shot read-only audit and is not exercised end-
 * to-end here (it talks to a live Supabase). What we DO want regression
 * coverage on:
 *   - `passesWhitelist` — the simulation primitive. If this drifts from the
 *     production gate's logic, every reported pass rate is meaningless.
 *   - `distribute` — the small reduction we use for seniority/function
 *     percentages. Null bucketing matters because incumbent rows can be
 *     missing structured extraction.
 *   - `passRateByKey` — per-bank and per-company breakdowns rely on this.
 *   - `buildCandidateWhitelists` — verifies the FIRST entry matches the
 *     live production whitelist exactly, so the report's "current" column
 *     can never silently drift from reality.
 */

import { describe, expect, it } from "vitest";
import {
  passesWhitelist,
  distribute,
  passRateByKey,
  buildCandidateWhitelists,
  type JobRow,
} from "./calibrate-incumbent-gate";
import {
  INCUMBENT_SIGNAL_FUNCTION_CATEGORIES,
  INCUMBENT_SIGNAL_SENIORITY,
} from "@/lib/analysis/incumbent-signal";

function job(overrides: Partial<JobRow>): JobRow {
  return {
    id: overrides.id ?? "j1",
    title: overrides.title ?? "Job",
    seniority_level: overrides.seniority_level ?? null,
    function_category: overrides.function_category ?? null,
    company_id: overrides.company_id ?? "c1",
  };
}

describe("passesWhitelist", () => {
  const wl = {
    name: "test",
    description: "test",
    seniorities: ["staff", "principal"] as const,
    functions: ["engineering-ai-ml", "data-science"] as const,
  };

  it("passes when both seniority and function are whitelisted", () => {
    expect(
      passesWhitelist(
        job({ seniority_level: "staff", function_category: "engineering-ai-ml" }),
        wl
      )
    ).toBe(true);
  });

  it("fails when seniority is below the bar even if function matches", () => {
    expect(
      passesWhitelist(
        job({ seniority_level: "senior", function_category: "engineering-ai-ml" }),
        wl
      )
    ).toBe(false);
  });

  it("fails when function is not whitelisted even if seniority matches", () => {
    expect(
      passesWhitelist(
        job({ seniority_level: "staff", function_category: "engineering-backend" }),
        wl
      )
    ).toBe(false);
  });

  it("fails when either field is null — mirrors the production gate's missing-structure rule", () => {
    expect(
      passesWhitelist(
        job({ seniority_level: null, function_category: "engineering-ai-ml" }),
        wl
      )
    ).toBe(false);
    expect(
      passesWhitelist(
        job({ seniority_level: "staff", function_category: null }),
        wl
      )
    ).toBe(false);
  });
});

describe("distribute", () => {
  it("counts every value and reports a percent that sums to ~100", () => {
    const rows = [
      job({ seniority_level: "senior" }),
      job({ seniority_level: "senior" }),
      job({ seniority_level: "staff" }),
      job({ seniority_level: "junior" }),
    ];
    const out = distribute(rows, "seniority_level");
    const total = out.reduce((s, r) => s + r.percent, 0);
    expect(total).toBeCloseTo(100, 1);
    const seniorRow = out.find((r) => r.value === "senior");
    expect(seniorRow?.count).toBe(2);
    expect(seniorRow?.percent).toBe(50);
  });

  it("buckets null values explicitly as '(null)' — needed for unclassified incumbents", () => {
    const rows = [
      job({ seniority_level: null }),
      job({ seniority_level: null }),
      job({ seniority_level: "staff" }),
    ];
    const out = distribute(rows, "seniority_level");
    const nullRow = out.find((r) => r.value === "(null)");
    expect(nullRow?.count).toBe(2);
  });

  it("returns rows sorted descending by count (highest-impact bucket first)", () => {
    const rows = [
      job({ function_category: "a" }),
      job({ function_category: "b" }),
      job({ function_category: "b" }),
      job({ function_category: "b" }),
      job({ function_category: "c" }),
      job({ function_category: "c" }),
    ];
    const out = distribute(rows, "function_category");
    expect(out.map((r) => r.value)).toEqual(["b", "c", "a"]);
  });

  it("handles an empty input without dividing by zero", () => {
    expect(distribute([] as JobRow[], "seniority_level")).toEqual([]);
  });
});

describe("passRateByKey", () => {
  const wl = {
    name: "test",
    description: "",
    seniorities: ["staff"] as const,
    functions: ["engineering-ai-ml"] as const,
  };

  it("aggregates total/passed/rate per key with 2-decimal percent", () => {
    const rows = [
      job({
        company_id: "rbc",
        seniority_level: "staff",
        function_category: "engineering-ai-ml",
      }),
      job({
        company_id: "rbc",
        seniority_level: "senior",
        function_category: "engineering-ai-ml",
      }),
      job({
        company_id: "td",
        seniority_level: "junior",
        function_category: "engineering-backend",
      }),
    ];
    const out = passRateByKey(rows, wl, (r) => r.company_id);
    const rbc = out.find((r) => r.key === "rbc");
    const td = out.find((r) => r.key === "td");
    expect(rbc?.total).toBe(2);
    expect(rbc?.passed).toBe(1);
    expect(rbc?.rate).toBe(50);
    expect(td?.total).toBe(1);
    expect(td?.passed).toBe(0);
    expect(td?.rate).toBe(0);
  });
});

describe("buildCandidateWhitelists", () => {
  it("first entry is the live production gate — preventing silent drift", () => {
    const list = buildCandidateWhitelists();
    expect(list[0].name).toContain("current");
    expect([...list[0].seniorities]).toEqual([...INCUMBENT_SIGNAL_SENIORITY]);
    expect([...list[0].functions]).toEqual([
      ...INCUMBENT_SIGNAL_FUNCTION_CATEGORIES,
    ]);
  });

  it("includes a +senior probe so we can quantify the impact of lowering the bar", () => {
    const list = buildCandidateWhitelists();
    const plusSenior = list.find((w) => w.name === "+senior");
    expect(plusSenior).toBeDefined();
    expect(plusSenior?.seniorities).toContain("senior");
  });

  it("includes a -aml-financial-crime probe so we can quantify dropping a noisy function", () => {
    const list = buildCandidateWhitelists();
    const noAml = list.find((w) => w.name === "-aml-financial-crime");
    expect(noAml).toBeDefined();
    expect(noAml?.functions).not.toContain("aml-financial-crime");
  });

  it("includes a +product-management probe so we can score adding the category at the staff+ bar", () => {
    const list = buildCandidateWhitelists();
    const plusPm = list.find((w) => w.name.includes("product-management"));
    expect(plusPm).toBeDefined();
    expect(plusPm?.functions).toContain("product-management");
  });
});
