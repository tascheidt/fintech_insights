import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * Visual smoke — Stream H regression net for the upcoming route swap and
 * v2 page rebuilds. NOT a pixel-diff suite.
 *
 * For each public-ish route this spec asserts:
 *   1. HTTP response status < 400 (no 5xx, no broken-page error boundary)
 *   2. No `console.error` events and no unhandled page errors during load
 *
 * Auth strategy
 * -------------
 * Two Playwright projects, plus a setup project:
 *   - `setup` (auth.setup.ts) mints a Supabase session for the test user via
 *     the admin API and saves storage state.
 *   - `chromium-public` runs the PUBLIC_ROUTES describe — no storage state.
 *   - `chromium-authed` runs the AUTHED_ROUTES describe — loads the saved
 *     storage state so every test arrives logged in.
 *
 * Each describe block uses a `test.skip` predicate keyed off the project
 * name so the matrix only executes the right combination.
 */

type RouteCheck = {
  path: string;
  /** If true, allow the request to land anywhere (e.g. marketing -> /dashboard or /login). */
  allowRedirect?: boolean;
  /** Console message texts to ignore (third-party noise, expected dev warnings, etc.). */
  ignoreConsole?: RegExp[];
};

// Public routes — no session required. These should render without redirecting
// (or, in the case of `/`, may redirect to `/dashboard` if a session exists; in
// the test env there is no session so it should land on the marketing page or
// `/login`).
const PUBLIC_ROUTES: RouteCheck[] = [
  { path: "/", allowRedirect: true },
  { path: "/login" },
];

// Auth-gated routes. Without a test session these will 307 to `/login`; we
// still want to confirm the redirect chain doesn't 5xx. Skipped today because
// `playwright.config.ts` has no auth state — flip these on once a fixture exists.
// `/releases` lives under the (dashboard) route group so it's auth-gated despite
// being linked from the user menu.
const AUTHED_ROUTES: RouteCheck[] = [
  { path: "/dashboard" },
  { path: "/jobs" },
  { path: "/companies" },
  // `/digests` redirects to the latest digest by id — verify it loads, not the URL.
  { path: "/digests", allowRedirect: true },
  { path: "/digests/archive" },
  { path: "/settings" },
  { path: "/labs" },
  { path: "/releases" },
];

/**
 * Console messages we never want to fail on. Keep this list tight — the
 * whole point of the spec is to surface real regressions.
 */
const GLOBAL_CONSOLE_IGNORES: RegExp[] = [
  // Next.js dev-mode hydration hints that aren't actionable in a smoke test.
  /Download the React DevTools/i,
  // Supabase auth-helpers occasionally logs a benign "no session" debug line.
  /Auth session missing/i,
];

function attachConsoleCollector(page: Page, ignore: RegExp[]): { errors: string[] } {
  const errors: string[] = [];
  const handler = (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (ignore.some((re) => re.test(text))) return;
    errors.push(text);
  };
  page.on("console", handler);
  page.on("pageerror", (err) => {
    const text = err.message;
    if (ignore.some((re) => re.test(text))) return;
    errors.push(`pageerror: ${text}`);
  });
  return { errors };
}

async function visit(page: Page, route: RouteCheck) {
  const ignore = [...GLOBAL_CONSOLE_IGNORES, ...(route.ignoreConsole ?? [])];
  const { errors } = attachConsoleCollector(page, ignore);

  const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });

  // `goto` can return null for same-document navigations, but for a top-level
  // route load we always expect a response.
  expect(response, `no response for ${route.path}`).not.toBeNull();
  const status = response!.status();
  expect(status, `${route.path} returned HTTP ${status}`).toBeLessThan(400);

  if (!route.allowRedirect) {
    // Redirect chain should not have bounced us to an unexpected error page.
    const finalUrl = new URL(page.url());
    expect(
      finalUrl.pathname,
      `expected to remain on ${route.path}, ended at ${finalUrl.pathname}`,
    ).toBe(route.path);
  }

  // Give the framework a tick to flush any deferred client errors.
  await page.waitForLoadState("load").catch(() => {
    // Some pages stream forever in dev; ignore the load timeout — we already
    // have the DOM and the console listener has been attached since goto().
  });

  expect(
    errors,
    `console errors on ${route.path}:\n${errors.join("\n")}`,
  ).toEqual([]);
}

// Public routes run in the `chromium-public` project (no storage state).
test.describe("visual smoke — public routes", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`renders ${route.path} without console errors`, async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name !== "chromium-public",
        "public routes only execute in the chromium-public project",
      );
      await visit(page, route);
    });
  }
});

// Auth-gated routes run in the `chromium-authed` project, which depends on
// the `setup` project to mint a Supabase session. See `auth.setup.ts`.
test.describe("visual smoke — auth-gated routes", () => {
  for (const route of AUTHED_ROUTES) {
    test(`renders ${route.path}`, async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name !== "chromium-authed",
        "auth-gated routes only execute in the chromium-authed project",
      );
      await visit(page, route);
    });
  }
});
