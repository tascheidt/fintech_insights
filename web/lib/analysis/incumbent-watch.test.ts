/**
 * Regression tests for `buildIncumbentWatch` — the "Incumbent Watch"
 * weekly-digest block (Phase 2, Surface 3).
 *
 * The block is a gated lens on big-bank hiring. Two invariants must hold no
 * matter what the digest pipeline does around it:
 *
 *  1. **Incumbent-only.** The query already filters `tier='incumbent'`; the
 *     builder must group strictly by that slice and never surface a fintech
 *     row even if one slips into the returned rows.
 *  2. **Signal-gated.** Only staff+ roles in AI/ML, Data & Risk-AI
 *     (`isIncumbentSignalJob`) count. A senior-and-below or off-function
 *     bank role is noise and must be dropped.
 *
 * The fixture is deliberately mixed-tier and mixed-signal. We force the AI
 * interpretation call to fail (no `GEMINI_API_KEY`) so the test also exercises
 * the structured fallback: heads present, `interpretation: null`, block never
 * dropped when structured data exists.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ----------------------------------------------------------------------------
// Supabase admin mock — returns a fixed mixed-tier / mixed-signal job set.
// ----------------------------------------------------------------------------
// `buildIncumbentWatch` issues one query: incumbent jobs first-seen in the
// week. The query itself filters tier='incumbent', so the realistic mock
// returns only incumbent rows — but we add one fintech row to prove the
// builder's own grouping never lets it through, and several incumbent rows
// that fail the signal gate.

interface FixtureRow {
  id: string;
  title: string;
  seniority_level: string | null;
  function_category: string | null;
  company_id: string;
  companies: {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    tier: string;
  };
}

let fixtureRows: FixtureRow[] = [];

function makeQueryChain() {
  const chain: Record<string, unknown> = {};
  const passthrough = () => chain;
  for (const method of ["select", "eq", "gte", "lte", "in", "order"]) {
    chain[method] = passthrough;
  }
  // Awaiting the chain resolves to the fixture result.
  (chain as { then: unknown }).then = (
    resolve: (value: { data: FixtureRow[]; error: null }) => unknown,
  ) => resolve({ data: fixtureRows, error: null });
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => makeQueryChain(),
  }),
}));

// Imports come AFTER the mock so they pick up the mocked admin client.
import { buildIncumbentWatch } from "./digest";

const RBC = {
  id: "rbc",
  name: "RBC",
  slug: "rbc",
  is_active: true,
  tier: "incumbent",
};
const TD = {
  id: "td",
  name: "TD",
  slug: "td",
  is_active: true,
  tier: "incumbent",
};
const FINTECH = {
  id: "acme",
  name: "Acme Fintech",
  slug: "acme",
  is_active: true,
  tier: "fintech",
};

function row(
  id: string,
  title: string,
  seniority: string | null,
  fn: string | null,
  company: FixtureRow["companies"],
): FixtureRow {
  return {
    id,
    title,
    seniority_level: seniority,
    function_category: fn,
    company_id: company.id,
    companies: company,
  };
}

const WEEK_START = new Date("2026-05-11T00:00:00.000Z");
const WEEK_END = new Date("2026-05-17T23:59:59.999Z");

describe("buildIncumbentWatch", () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    // Force the AI interpretation call to short-circuit so we test the
    // structured fallback path deterministically (no network).
    savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey;
    fixtureRows = [];
    vi.restoreAllMocks();
  });

  it("returns only incumbent-tier signal roles, grouped by bank", async () => {
    fixtureRows = [
      // RBC — 3 qualifying signal roles (staff+ in AI/ML / Data).
      row("r1", "Staff AI Researcher", "staff", "engineering-ai-ml", RBC),
      row("r2", "Principal ML Engineer", "principal", "engineering-ai-ml", RBC),
      row("r3", "Lead Data Scientist", "lead", "data-science", RBC),
      // RBC — noise: senior (below staff bar) -> dropped.
      row("r4", "Senior Backend Engineer", "senior", "engineering-ai-ml", RBC),
      // RBC — noise: staff but off-function (GTM) -> dropped.
      row("r5", "Staff Sales Engineer", "staff", "solutions-engineering", RBC),
      // TD — 1 qualifying signal role (executive in Risk).
      row("t1", "VP, Model Risk", "executive", "risk-management", TD),
      // A fintech row that must never leak into the block.
      row("f1", "Staff AI Engineer", "staff", "engineering-ai-ml", FINTECH),
      // An incumbent row with unextracted structured fields -> dropped.
      row("r6", "Staff Engineer", null, null, RBC),
    ];

    const watch = await buildIncumbentWatch(WEEK_START, WEEK_END);

    expect(watch).not.toBeNull();
    const banks = watch!.banks;

    // Only the two incumbent banks — fintech is never grouped in.
    expect(banks.map((b) => b.company_name).sort()).toEqual(["RBC", "TD"]);

    // Banks sorted by signal volume — RBC (3) before TD (1).
    expect(banks[0].company_name).toBe("RBC");
    expect(banks[0].signal_role_count).toBe(3);
    expect(banks[1].company_name).toBe("TD");
    expect(banks[1].signal_role_count).toBe(1);

    // The senior/off-function/null-field rows were gated out.
    const totalSignal = banks.reduce((s, b) => s + b.signal_role_count, 0);
    expect(totalSignal).toBe(4);
  });

  it("emits structured head bullets with no interpretation when the AI call cannot run (fallback)", async () => {
    fixtureRows = [
      row("r1", "Staff AI Researcher", "staff", "engineering-ai-ml", RBC),
      row("r2", "Lead Data Scientist", "lead", "data-science", RBC),
    ];

    const watch = await buildIncumbentWatch(WEEK_START, WEEK_END);

    expect(watch).not.toBeNull();
    const rbc = watch!.banks[0];
    // Structured head present (count + function descriptor).
    expect(rbc.head).toBe("RBC · 2 senior AI/ML & Data roles");
    // AI failed -> interpretation is null, block still ships.
    expect(rbc.interpretation).toBeNull();
  });

  it("returns null when no incumbent bank has a qualifying senior hire", async () => {
    fixtureRows = [
      // Incumbent, but all rows fail the signal gate.
      row("r1", "Senior Backend Engineer", "senior", "engineering-ai-ml", RBC),
      row("r2", "Staff Sales Engineer", "staff", "solutions-engineering", RBC),
      // A fintech signal role — never counts toward the incumbent block.
      row("f1", "Staff AI Engineer", "staff", "engineering-ai-ml", FINTECH),
    ];

    const watch = await buildIncumbentWatch(WEEK_START, WEEK_END);

    // Empty == not rendered: the block is omitted entirely.
    expect(watch).toBeNull();
  });

  it("uses the singular 'role' for a one-role bank", async () => {
    fixtureRows = [
      row("t1", "VP, Model Risk", "executive", "risk-management", TD),
    ];

    const watch = await buildIncumbentWatch(WEEK_START, WEEK_END);

    expect(watch).not.toBeNull();
    expect(watch!.banks[0].head).toBe("TD · 1 senior Risk-AI role");
  });
});
