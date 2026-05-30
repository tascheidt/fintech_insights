/**
 * Regression tests for the company-tier filter introduced in the big-6 bank
 * integration plan (Phase 0). Big-bank "incumbent" rows must never leak into
 * the cross-company volume aggregators by default — every aggregator filters
 * via `.in("companies.tier", tiers)` with a fintech-only default. These
 * tests fail if the filter is dropped from any aggregator we know skews
 * volume views.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ----------------------------------------------------------------------------
// Chain-recording Supabase mock.
// ----------------------------------------------------------------------------
// Every supabase-js query builder method returns the chainable object, so we
// can substitute the whole client with a Proxy that records each call and
// returns itself. Awaiting the chain resolves to `{ data: [], error: null }`
// (the empty-result shape the aggregators tolerate).

type CallLog = Array<{ method: string; args: unknown[] }>;

function makeChain(callLog: CallLog) {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: [], error: null });
      }
      if (typeof prop !== "string") return undefined;
      return (...args: unknown[]) => {
        callLog.push({ method: prop, args });
        return chainProxy;
      };
    },
  };
  const chainProxy: object = new Proxy({}, handler);
  return chainProxy;
}

const callLogs: Record<string, CallLog> = {};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const log = callLogs[table] ?? [];
      callLogs[table] = log;
      return makeChain(log);
    },
  }),
}));

// Imports must come AFTER the mock to ensure they pick up the mocked client.
import {
  DEFAULT_TIERS,
  getCompetitiveMatrixData,
  getCrossCompanyThemes,
  getFunctionHeatData,
  getHotRoles,
  getIncumbentBets,
  getJobsListData,
  getNetHiringFlow,
  getNetThisWeek,
  getPostingTrends,
  getRawFunctionData,
  type CompanyTier,
} from "./dashboard-queries";

function tierFilterArgs(table: string): unknown[][] {
  const log = callLogs[table] ?? [];
  return log
    .filter((c) => c.method === "in" && c.args[0] === "companies.tier")
    .map((c) => c.args as unknown[]);
}

beforeEach(() => {
  for (const key of Object.keys(callLogs)) delete callLogs[key];
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ----------------------------------------------------------------------------

describe("DEFAULT_TIERS", () => {
  it("is fintech-only", () => {
    expect([...DEFAULT_TIERS]).toEqual(["fintech"]);
  });

  it("does not include 'incumbent' — that's the whole point of Phase 0", () => {
    expect([...DEFAULT_TIERS]).not.toContain("incumbent");
  });
});

describe("volume aggregators apply the default fintech-only tier filter", () => {
  const cutoffs = new Map<string, Date>();

  it("getCompetitiveMatrixData filters the companies seed AND both job_postings pulls (main + this-week closures) on tier=fintech", async () => {
    await getCompetitiveMatrixData(cutoffs);
    // The function fires three queries: companies seed, main jobs join,
    // and a closed-this-week pull. All three must be tier-filtered.
    expect(tierFilterArgs("job_postings")).toEqual([
      ["companies.tier", ["fintech"]],
      ["companies.tier", ["fintech"]],
    ]);
    expect(
      (callLogs["companies"] ?? []).some(
        (c) =>
          c.method === "in" &&
          c.args[0] === "tier" &&
          JSON.stringify(c.args[1]) === '["fintech"]'
      )
    ).toBe(true);
  });

  it("getHotRoles defaults to fintech-only", async () => {
    await getHotRoles(cutoffs);
    expect(tierFilterArgs("job_postings")).toEqual([["companies.tier", ["fintech"]]]);
  });

  it("getNetThisWeek filters BOTH the new- and closed-job pulls", async () => {
    await getNetThisWeek(cutoffs);
    const filters = tierFilterArgs("job_postings");
    expect(filters).toEqual([
      ["companies.tier", ["fintech"]],
      ["companies.tier", ["fintech"]],
    ]);
  });

  it("getPostingTrends filters on tier=fintech", async () => {
    await getPostingTrends(30, cutoffs);
    expect(tierFilterArgs("job_postings")).toEqual([["companies.tier", ["fintech"]]]);
  });

  it("getRawFunctionData filters on tier=fintech", async () => {
    await getRawFunctionData(30, cutoffs);
    expect(tierFilterArgs("job_postings")).toEqual([["companies.tier", ["fintech"]]]);
  });

  it("getNetHiringFlow filters on tier=fintech for BOTH new and closed pulls", async () => {
    await getNetHiringFlow(30, cutoffs);
    expect(tierFilterArgs("job_postings")).toEqual([
      ["companies.tier", ["fintech"]],
      ["companies.tier", ["fintech"]],
    ]);
  });

  it("getFunctionHeatData filters on tier=fintech for both recent and long-range pulls", async () => {
    await getFunctionHeatData();
    expect(tierFilterArgs("job_postings")).toEqual([
      ["companies.tier", ["fintech"]],
      ["companies.tier", ["fintech"]],
    ]);
  });

  it("getCrossCompanyThemes filters on tier=fintech", async () => {
    await getCrossCompanyThemes();
    expect(tierFilterArgs("job_postings")).toEqual([["companies.tier", ["fintech"]]]);
  });
});

describe("getJobsListData tier filter (Phase 2 Step 1 — leak G4)", () => {
  it("defaults to fintech-only so RBC's ~1,500 jobs don't flood the /jobs list", async () => {
    await getJobsListData();
    expect(tierFilterArgs("job_postings")).toEqual([["companies.tier", ["fintech"]]]);
  });

  it("accepts an explicit tiers override (the Jobs-page Tier toggle opting into incumbents)", async () => {
    await getJobsListData({ tiers: ["fintech", "incumbent"] });
    expect(tierFilterArgs("job_postings")).toEqual([
      ["companies.tier", ["fintech", "incumbent"]],
    ]);
  });

  it("short-circuits an empty jobIds snapshot without issuing a query", async () => {
    const result = await getJobsListData({ jobIds: [] });
    expect(result).toEqual({ rows: [], truncated: false });
    expect(tierFilterArgs("job_postings")).toEqual([]);
  });
});

describe("getJobsListData full-text search (description match)", () => {
  function textSearchCalls(table: string): unknown[][] {
    const log = callLogs[table] ?? [];
    return log.filter((c) => c.method === "textSearch").map((c) => c.args as unknown[]);
  }
  function limitCalls(table: string): number[] {
    const log = callLogs[table] ?? [];
    return log.filter((c) => c.method === "limit").map((c) => c.args[0] as number);
  }

  it("issues no full-text search when searchQuery is null", async () => {
    await getJobsListData({ searchQuery: null });
    expect(textSearchCalls("job_postings")).toEqual([]);
    expect(limitCalls("job_postings")).toEqual([500]);
  });

  it("issues no full-text search for whitespace-only searchQuery", async () => {
    await getJobsListData({ searchQuery: "   " });
    expect(textSearchCalls("job_postings")).toEqual([]);
    expect(limitCalls("job_postings")).toEqual([500]);
  });

  // Convenience: the tsquery string passed to the single textSearch call.
  async function tsqueryFor(q: string): Promise<string> {
    for (const key of Object.keys(callLogs)) delete callLogs[key];
    await getJobsListData({ searchQuery: q });
    const calls = textSearchCalls("job_postings");
    return calls.length ? (calls[0][1] as string) : "";
  }

  it("bare words AND-match as prefixes (type-ahead) and lift the cap to 1000", async () => {
    await getJobsListData({ searchQuery: "staff engineer" });
    const calls = textSearchCalls("job_postings");
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("search_tsv");
    expect(calls[0][1]).toBe("staff:* & engineer:*");
    expect(calls[0][2]).toEqual({ config: "english" });
    expect(limitCalls("job_postings")).toEqual([1000]);
  });

  it("supports short terms — tsvector prefix has no 3-char floor", async () => {
    expect(await tsqueryFor("ai")).toBe("ai:*");
  });

  it("a closed quoted phrase becomes an exact adjacency match (no prefix)", async () => {
    expect(await tsqueryFor('"staff engineer"')).toBe("(staff <-> engineer)");
  });

  it("a single quoted word matches exactly (no prefix marker)", async () => {
    expect(await tsqueryFor('"engineer"')).toBe("engineer");
  });

  it("an unterminated quote (mid-type) keeps the last word as a prefix", async () => {
    expect(await tsqueryFor('"staff eng')).toBe("(staff <-> eng:*)");
  });

  it("a leading - excludes a term", async () => {
    expect(await tsqueryFor("engineer -contract")).toBe("engineer:* & !contract:*");
  });

  it("excludes a quoted phrase", async () => {
    expect(await tsqueryFor('-"data entry"')).toBe("!(data <-> entry)");
  });

  it("combines phrase, prefix words and exclusion", async () => {
    expect(await tsqueryFor('python "machine learning" -senior')).toBe(
      "python:* & (machine <-> learning) & !senior:*"
    );
  });

  it("a hyphenated bare token expands to AND-ed prefix words", async () => {
    expect(await tsqueryFor("full-stack")).toBe("full:* & stack:*");
  });

  it("strips tsquery-operator characters so users cannot inject syntax", async () => {
    // Colons, ampersands, pipes, parens, stars, backslashes outside a quoted
    // run never survive — only sanitized alnum lexemes plus the operators we
    // emit ourselves remain.
    expect(await tsqueryFor("foo, bar; baz) &|:*\\")).toBe("foo:* & bar:* & baz:*");
  });

  it("returns the {rows, truncated} shape with truncated=false on empty data", async () => {
    const result = await getJobsListData({ searchQuery: "engineer" });
    expect(result).toEqual({ rows: [], truncated: false });
  });
});

describe("getIncumbentBets (Phase 2 — Incumbent Bets rail / company panel)", () => {
  function eqArgs(table: string): unknown[][] {
    const log = callLogs[table] ?? [];
    return log.filter((c) => c.method === "eq").map((c) => c.args as unknown[]);
  }

  it("scopes strictly to tier='incumbent' — the inverse of the volume aggregators", async () => {
    await getIncumbentBets();
    const eqs = eqArgs("job_postings");
    expect(eqs).toContainEqual(["companies.tier", "incumbent"]);
    // It must never fintech-scope — this surface is incumbent-only.
    expect(eqs).not.toContainEqual(["companies.tier", "fintech"]);
  });

  it("returns an empty array (not an error) when there are no incumbent jobs", async () => {
    const result = await getIncumbentBets();
    expect(result).toEqual([]);
  });

  it("accepts a companyId scope for the per-company 'Senior hiring signal' panel", async () => {
    await getIncumbentBets({ companyId: "rbc-uuid" });
    const eqs = eqArgs("job_postings");
    expect(eqs).toContainEqual(["company_id", "rbc-uuid"]);
  });
});

describe("volume aggregators accept an explicit tiers argument", () => {
  const cutoffs = new Map<string, Date>();

  it("getHotRoles can be scoped to incumbents only (Phase 2 'Incumbent Bets' rail)", async () => {
    const tiers: CompanyTier[] = ["incumbent"];
    await getHotRoles(cutoffs, 15, tiers);
    expect(tierFilterArgs("job_postings")).toEqual([["companies.tier", ["incumbent"]]]);
  });

  it("getCompetitiveMatrixData can include both tiers via the 'include incumbents' toggle", async () => {
    await getCompetitiveMatrixData(cutoffs, { tiers: ["fintech", "incumbent"] });
    expect(tierFilterArgs("job_postings")).toEqual([
      ["companies.tier", ["fintech", "incumbent"]],
      ["companies.tier", ["fintech", "incumbent"]],
    ]);
  });
});
