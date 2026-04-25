import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the launch smoke test.
 *
 * Scope is intentionally tiny — see `e2e/smoke.spec.ts` and the "Tests"
 * section in `docs/AGENTS.md`. Authenticated flows and DB-dependent pages
 * are out of scope; the only contract this enforces is that the login page
 * renders and the OAuth button is visible.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
