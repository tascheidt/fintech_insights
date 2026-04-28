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
test("login page renders and shows the Google OAuth button", async ({
  page,
}, testInfo) => {
  // /login redirects to /dashboard when a session cookie is present, so this
  // smoke only makes sense in the unauthed (`chromium-public`) project. The
  // visual-smoke spec covers the equivalent authed path.
  test.skip(
    testInfo.project.name !== "chromium-public",
    "login smoke runs in chromium-public only"
  );
  await page.goto("/login");

  // Hero copy — confirms we hit the login page and not an error boundary.
  // Update both this and `app/(auth)/login/page.tsx` together if the hero
  // copy is rewritten.
  await expect(
    page.getByRole("heading", { name: /Decode hiring strategy/i })
  ).toBeVisible();

  // The "Continue with Google" button is the OAuth entry point. If it's
  // missing, the auth flow is broken even if the page itself rendered.
  await expect(
    page.getByRole("button", { name: /Continue with Google/i })
  ).toBeVisible();
});
