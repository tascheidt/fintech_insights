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
import { adminPatchSchema } from "./validation";

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
