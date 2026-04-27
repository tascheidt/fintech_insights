import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * Playwright config.
 *
 * Two projects + a setup project:
 *   - `setup`         — `e2e/auth.setup.ts`. Runs once, mints a Supabase
 *                       session for the test user, writes
 *                       `playwright/.auth/user.json`.
 *   - `chromium-public` — Public routes that should not require a session.
 *                         Uses no storage state.
 *   - `chromium-authed` — Auth-gated routes. Depends on `setup`; loads the
 *                         shared storage state so every test arrives logged in.
 *
 * Specs label themselves with the matching project name via `test.use`
 * (see `visual-smoke.spec.ts`). The legacy `smoke.spec.ts` doesn't need
 * auth — it stays in the public project.
 *
 * Env: pulls Supabase URL + service role from `.env.local`. Both are
 * required for the setup project to mint the test user's session.
 */

// Load `.env.local` via Node 22's built-in env-file loader. We don't need
// `dotenv` as a dependency. Wrapped in try/catch so missing file (e.g. CI)
// doesn't crash config evaluation — the setup project will throw a clearer
// error when it actually needs SUPABASE_SERVICE_ROLE_KEY. Resolve relative
// to cwd because Playwright loads this config via CJS, where `import.meta`
// isn't available; running `npx playwright test` from `web/` is the contract.
try {
  process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));
} catch {
  // .env.local missing — fine for `npx playwright show-report` etc.
}

const STORAGE_FILE = path.resolve(process.cwd(), "playwright/.auth/user.json");

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
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-public",
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        // Public project explicitly clears any leaked storage state.
        storageState: { cookies: [], origins: [] },
      },
    },
    {
      name: "chromium-authed",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: STORAGE_FILE,
      },
    },
  ],
});
