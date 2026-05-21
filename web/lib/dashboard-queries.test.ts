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
