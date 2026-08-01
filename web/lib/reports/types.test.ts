import { describe, it, expect } from "vitest";
import {
  buildReportTitle,
  buildReportUrl,
  describeSearchContext,
  isLikelyEmail,
  parseRecipients,
  sampleJobsForSynthesis,
  type ReportSearchContext,
} from "./types";

const baseContext: ReportSearchContext = {
  query: null,
  mode: "keyword",
  company: null,
  functionGroup: null,
  recency: "any",
  tier: "fintech",
  status: "active",
};

describe("describeSearchContext", () => {
  it("falls back to a plain label when nothing is narrowed", () => {
    expect(describeSearchContext(baseContext)).toBe("All tracked roles");
  });

  it("distinguishes semantic from keyword search", () => {
    expect(
      describeSearchContext({ ...baseContext, query: "AI Engineer", mode: "semantic" })
    ).toBe('Semantic search for "AI Engineer"');
    expect(
      describeSearchContext({ ...baseContext, query: "AI Engineer", mode: "keyword" })
    ).toBe('Search for "AI Engineer"');
  });

  it("omits the default tier and status scopes but names the others", () => {
    expect(
      describeSearchContext({ ...baseContext, tier: "fintech", status: "active" })
    ).toBe("All tracked roles");
    expect(
      describeSearchContext({ ...baseContext, tier: "all", status: "all" })
    ).toBe("fintechs and incumbent banks · open and closed roles");
  });

  it("joins every active facet in order", () => {
    expect(
      describeSearchContext({
        ...baseContext,
        query: "risk",
        company: "Wealthsimple",
        functionGroup: "Engineering",
        recency: "30",
      })
    ).toBe(
      'Search for "risk" · Wealthsimple · Engineering · posted in the last 30 days'
    );
  });
});

describe("buildReportTitle", () => {
  it("prefers the query, title-cased, and keeps acronyms intact", () => {
    expect(
      buildReportTitle({ ...baseContext, query: "AI engineer" }, 12)
    ).toBe("AI Engineer — 12 roles");
  });

  it("falls back through company then function then a generic title", () => {
    expect(buildReportTitle({ ...baseContext, company: "Koho" }, 3)).toBe(
      "Koho — 3 roles"
    );
    expect(
      buildReportTitle({ ...baseContext, functionGroup: "Engineering" }, 1)
    ).toBe("Engineering — 1 role");
    expect(buildReportTitle(baseContext, 40)).toBe("Fintech hiring — 40 roles");
  });
});

describe("buildReportUrl", () => {
  it("joins cleanly regardless of a trailing slash on the base", () => {
    expect(buildReportUrl("abc123", "https://example.com/")).toBe(
      "https://example.com/r/abc123"
    );
    expect(buildReportUrl("abc123", "https://example.com")).toBe(
      "https://example.com/r/abc123"
    );
  });
});

describe("sampleJobsForSynthesis", () => {
  const rows = (spec: Array<[string, number]>) =>
    spec.flatMap(([slug, n]) =>
      Array.from({ length: n }, (_, i) => ({ companySlug: slug, id: `${slug}-${i}` }))
    );

  it("returns the input untouched when it fits under the limit", () => {
    const input = rows([["a", 3]]);
    expect(sampleJobsForSynthesis(input, 10)).toEqual(input);
  });

  it("stops one company from monopolizing the sample", () => {
    const sample = sampleJobsForSynthesis(rows([["big", 50], ["small", 2]]), 10);
    expect(sample).toHaveLength(10);
    expect(sample.filter((r) => r.companySlug === "small")).toHaveLength(2);
  });

  it("still fills the sample when only one company has rows", () => {
    expect(sampleJobsForSynthesis(rows([["solo", 30]]), 10)).toHaveLength(10);
  });
});

describe("recipient parsing", () => {
  it("splits on commas, semicolons, and newlines", () => {
    expect(parseRecipients("a@b.com, c@d.com;e@f.com\ng@h.com")).toEqual([
      "a@b.com",
      "c@d.com",
      "e@f.com",
      "g@h.com",
    ]);
  });

  it("drops empty fragments from trailing separators", () => {
    expect(parseRecipients("a@b.com, ,")).toEqual(["a@b.com"]);
  });

  it("rejects obvious non-addresses", () => {
    expect(isLikelyEmail("a@b.com")).toBe(true);
    expect(isLikelyEmail("not-an-email")).toBe(false);
    expect(isLikelyEmail("two@parts@here.com")).toBe(false);
  });
});
