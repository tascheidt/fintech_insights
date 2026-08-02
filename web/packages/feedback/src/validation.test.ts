/**
 * Regression tests for the admin-feedback PATCH Zod schema.
 *
 * Picked as the schema test because:
 *   - It's exported (testable without importing a route handler).
 *   - The admin feedback panel mutates real DB rows and an over-permissive
 *     parse here would let a bad request slip through.
 *
 * Per CLAUDE.md §7: Zod errors are read via `.issues`, never `.errors`. The
 * second case below asserts that exact contract — Vercel's TS is strict
 * enough that `.errors` would silently typecheck against `unknown` but
 * return undefined at runtime.
 */

import { describe, it, expect } from "vitest";
import {
  adminPatchSchema,
  createFeedbackSchema,
  reviewStateFromLegacyDecision,
} from "./validation";
import { DEFAULT_FEEDBACK_TYPES } from "./types";

describe("adminPatchSchema", () => {
  it("parses a valid admin PATCH body", () => {
    const result = adminPatchSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      admin_override_decision: "accepted",
      admin_notes: "Reviewed and approved.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.admin_override_decision).toBe("accepted");
      expect(result.data.id).toBe("550e8400-e29b-41d4-a716-446655440000");
    }
  });

  it("rejects an invalid body and exposes errors via `error.issues` (NOT .errors)", () => {
    const result = adminPatchSchema.safeParse({
      id: "not-a-uuid",
      admin_override_decision: "maybe", // not in enum
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // Per CLAUDE.md: read Zod errors via `.issues`, never `.errors`.
      // This assertion locks the contract so a future Zod major can't
      // silently break the convention.
      expect(Array.isArray(result.error.issues)).toBe(true);
      expect(result.error.issues.length).toBeGreaterThan(0);

      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("id");
      expect(paths).toContain("admin_override_decision");
    }
  });
});

/**
 * `pageUrl` is written by the client from `usePathname()`, but the route is
 * reachable directly — and the value is rendered back into the admin review
 * table. These cases lock the bound and the shape so the Zod layer agrees with
 * the DB constraint `feedback_page_url_len` (migration 20260731093000).
 */
describe("createFeedbackSchema — pageUrl", () => {
  const schema = createFeedbackSchema(DEFAULT_FEEDBACK_TYPES);

  const base = {
    type: "bug",
    title: "Revolut jobs stopped appearing",
    description: "The Revolut company page has shown zero open roles since Monday.",
  };

  it("accepts an app-relative path", () => {
    const result = schema.safeParse({ ...base, pageUrl: "/companies/revolut" });
    expect(result.success).toBe(true);
  });

  it("accepts a submission with no pageUrl at all", () => {
    const result = schema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("rejects an absolute URL (off-site value stored and rendered to admins)", () => {
    const result = schema.safeParse({
      ...base,
      pageUrl: "https://example.com/phishing",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a pageUrl longer than the DB constraint allows", () => {
    const result = schema.safeParse({ ...base, pageUrl: "/" + "a".repeat(500) });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown feedback type", () => {
    const result = schema.safeParse({ ...base, type: "urgent" });
    expect(result.success).toBe(false);
  });
});

/**
 * The review-state axis. `status` used to hold both the AI's verdict and the
 * human's decision, and the triage engine wrote terminal values straight into
 * it — so an AI decline was final and 20 of 21 production rows were never
 * human-reviewable. These cases lock the separation, and in particular that
 * reopening is expressible.
 */
describe("adminPatchSchema — review_state", () => {
  const ID = "550e8400-e29b-41d4-a716-446655440000";

  it.each(["needs_review", "approved", "rejected", "shipped"])(
    "accepts review_state=%s",
    (state) => {
      const result = adminPatchSchema.safeParse({ id: ID, review_state: state });
      expect(result.success).toBe(true);
    }
  );

  it("accepts reopening an AI-resolved submission", () => {
    // The behaviour the old model could not express at all.
    const result = adminPatchSchema.safeParse({ id: ID, review_state: "needs_review" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown review_state", () => {
    const result = adminPatchSchema.safeParse({ id: ID, review_state: "wontfix" });
    expect(result.success).toBe(false);
  });

  it("rejects a body with an id but nothing to change", () => {
    const result = adminPatchSchema.safeParse({ id: ID });
    expect(result.success).toBe(false);
  });

  it("still accepts the legacy admin_override_decision shape", () => {
    const result = adminPatchSchema.safeParse({
      id: ID,
      admin_override_decision: "accepted",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a notes-only update", () => {
    const result = adminPatchSchema.safeParse({ id: ID, admin_notes: "Chased upstream." });
    expect(result.success).toBe(true);
  });
});

describe("reviewStateFromLegacyDecision", () => {
  it("maps accepted to approved and declined to rejected", () => {
    expect(reviewStateFromLegacyDecision("accepted")).toBe("approved");
    expect(reviewStateFromLegacyDecision("declined")).toBe("rejected");
  });
});
