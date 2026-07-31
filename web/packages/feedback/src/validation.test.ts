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
import { adminPatchSchema, createFeedbackSchema } from "./validation";
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
