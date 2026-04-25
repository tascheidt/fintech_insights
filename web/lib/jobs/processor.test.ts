/**
 * Regression tests for the description_hash gate in the ingestion pipeline.
 *
 * The gate is the Phase 2 cost-saving feature: when a scraped description's
 * SHA-1 matches what we already stored, `extractAndUpdateStructure` (which
 * fires the Gemini Flash extraction call) is skipped. A regression here
 * would cause us to re-extract every job every collection run — silently
 * doubling Gemini cost.
 *
 * Two cases:
 *  1. Hash matches (description unchanged) -> extraction is NOT queued.
 *  2. Hash differs (description changed) -> extraction IS queued.
 *
 * Strategy: mock the admin Supabase client and the Gemini-driven
 * `extractJobStructure` (in `@/lib/analysis/structure`). When the hash
 * gate skips a job, `extractJobStructure` is never called; when the gate
 * fires through, it's called exactly once. Asserting on the inner Gemini
 * call avoids the same-module-spy problem of mocking
 * `extractAndUpdateStructure` directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const DESCRIPTION =
  "We are hiring a senior backend engineer to work on payments infrastructure.";
const STORED_HASH_MATCH = createHash("sha1").update(DESCRIPTION).digest("hex");
const STORED_HASH_DIFFERENT = "deadbeef".repeat(5); // 40 hex chars; not a real sha1 of DESCRIPTION

const extractJobStructureMock = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/analysis/structure", () => ({
  extractJobStructure: extractJobStructureMock,
  normalizeJobTitle: (title: string) => title,
  isValidDepartment: () => true,
  isValidLocation: () => true,
}));

vi.mock("@/lib/scrapers", () => ({
  fetchJobs: vi.fn().mockResolvedValue([]),
  jobToRow: (job: unknown) => job,
  isBrowserScraper: () => false,
}));

vi.mock("@/lib/github", () => ({
  triggerScrapeWorkflow: vi.fn(),
}));

vi.mock("@/lib/ai/prompt-config", () => ({
  getActiveJobStructureAiConfig: vi.fn().mockResolvedValue({
    stage: "job-structure",
    model: "gemini-flash-latest",
    promptTemplate: "x".repeat(300),
    temperature: 0.2,
    maxOutputTokens: 4096,
  }),
}));

// Mutated per-test to control what the "select existing job_postings" query
// returns. Defined at module scope so the Supabase mock factory can close
// over it.
let existingRows: Array<{
  id: string;
  external_id: string;
  description_hash: string | null;
}> = [];

function buildSupabaseMock() {
  const updateChain = {
    eq: vi.fn(() => Promise.resolve({ count: 0, data: null, error: null })),
    select: vi.fn(() => updateChain),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  const insertChain: Record<string, unknown> = {};
  insertChain.select = vi.fn(() => insertChain);
  insertChain.single = vi.fn(() => Promise.resolve({ data: { id: "new-job-id" }, error: null }));
  const selectChain = {
    eq: vi.fn(() => Promise.resolve({ data: existingRows, error: null })),
  };
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => selectChain),
      update: vi.fn(() => updateChain),
      insert: vi.fn(() => insertChain),
    })),
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => buildSupabaseMock(),
}));

vi.mock("./progress", () => ({
  updateTaskProgress: vi.fn().mockResolvedValue(undefined),
}));

const FIXTURE_COMPANY = {
  id: "co-1",
  slug: "acme",
  name: "Acme Fintech",
  ats_type: "lever",
  ats_identifier: "acme",
  careers_url: null,
  is_active: true,
} as const;

const FIXTURE_JOB = {
  external_id: "ext-1",
  title: "Senior Backend Engineer",
  department: "Engineering",
  team: null,
  location: "Toronto",
  location_type: "remote",
  description_html: `<p>${DESCRIPTION}</p>`,
  description_text: DESCRIPTION,
  commitment: "full-time",
  posted_date: null,
  url: "https://jobs.example.com/ext-1",
};

describe("runIngestStage description_hash gate", () => {
  beforeEach(() => {
    extractJobStructureMock.mockClear();
    existingRows = [];
  });

  it("skips the Gemini extraction call when the stored hash matches the new description", async () => {
    existingRows = [
      {
        id: "existing-job-1",
        external_id: FIXTURE_JOB.external_id,
        description_hash: STORED_HASH_MATCH,
      },
    ];

    const { runIngestStage } = await import("./processor");
    await runIngestStage("task-1", FIXTURE_COMPANY as never, [FIXTURE_JOB] as never);

    expect(extractJobStructureMock).toHaveBeenCalledTimes(0);
  });

  it("runs the Gemini extraction call when the stored hash differs from the new description", async () => {
    existingRows = [
      {
        id: "existing-job-1",
        external_id: FIXTURE_JOB.external_id,
        description_hash: STORED_HASH_DIFFERENT,
      },
    ];

    const { runIngestStage } = await import("./processor");
    await runIngestStage("task-2", FIXTURE_COMPANY as never, [FIXTURE_JOB] as never);

    expect(extractJobStructureMock).toHaveBeenCalledTimes(1);
  });
});
