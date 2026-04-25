import { test, expect } from "@playwright/test";

/**
 * Single launch smoke test.
 *
 * Reduced from the original "homepage -> digest -> admin trigger" plan to
 * just "login page renders + OAuth button visible." See
 * `docs/AGENTS.md#Tests` for the rationale: digests and admin pages need
 * authenticated DB state, so a meaningful e2e there requires fixtures we
 * don't have yet. This test is the minimum-viable canary that catches a
 * fully broken deploy.
 */
test("login page renders and shows the Google OAuth button", async ({ page }) => {
  await page.goto("/login");

  // Hero copy — confirms we hit the login page and not an error boundary.
  await expect(page.getByRole("heading", { name: /Fintech/i })).toBeVisible();

  // The "Continue with Google" button is the OAuth entry point. If it's
  // missing, the auth flow is broken even if the page itself rendered.
  await expect(
    page.getByRole("button", { name: /Continue with Google/i })
  ).toBeVisible();
});
