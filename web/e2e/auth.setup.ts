import { test as setup, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";

/**
 * Playwright auth setup project.
 *
 * Mints a Supabase session for a stable test user and saves the resulting
 * cookies to `playwright/.auth/user.json`. Every auth-gated test in the
 * `chromium-authed` project loads that storage state — individual tests
 * don't need to log in.
 *
 * Strategy: admin API mints a magic-link `hashed_token` for the test user;
 * we exchange the token via `verifyOtp` from the regular client to get a
 * session, then inject the @supabase/ssr cookie format directly into the
 * Playwright browser context. This avoids two thorny paths:
 *   - Supabase's redirect-URL allowlist (the browser-redirect flow needs
 *     localhost in the project's URL Configuration; not always set).
 *   - Provider settings (email/password sign-in may be disabled at the
 *     project level even when admin-issued tokens still verify).
 *
 * Requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
 * `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. All three are required at
 * app boot per `lib/env.ts`.
 *
 * Storage state is gitignored (`/playwright/.auth/`) — never commit it.
 */

const TEST_EMAIL =
  process.env.PLAYWRIGHT_TEST_EMAIL ?? "playwright-e2e@talentbrief.test";

// Resolve relative to cwd because Playwright loads spec files via CJS,
// where `import.meta` isn't available. The contract is `cd web && playwright …`.
const STORAGE_FILE = path.resolve(process.cwd(), "playwright/.auth/user.json");

setup("authenticate test user", async ({ page, context, baseURL }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    throw new Error(
      "auth.setup requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY (load via .env.local)",
    );
  }
  if (!baseURL) {
    throw new Error("auth.setup requires playwright config `use.baseURL`");
  }

  const projectRef = url.match(/https:\/\/(.+?)\.supabase\.co/)?.[1];
  if (!projectRef) {
    throw new Error(`Could not extract project ref from ${url}`);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Find or create the test user.
  let userId: string | null = null;
  {
    const { data: list, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const existing = list.users.find((u) => u.email === TEST_EMAIL);
    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email: TEST_EMAIL,
          email_confirm: true,
          user_metadata: { full_name: "Playwright E2E" },
        });
      if (createErr || !created.user) {
        throw new Error(`createUser failed: ${createErr?.message ?? "unknown"}`);
      }
      userId = created.user.id;
    }
  }

  // 2. Ensure a profile row exists (the dashboard layout reads profiles.role).
  const { error: profileErr } = await admin
    .from("profiles")
    .upsert(
      {
        id: userId,
        email: TEST_EMAIL,
        full_name: "Playwright E2E",
        role: "viewer",
      },
      { onConflict: "id" },
    );
  if (profileErr) {
    console.warn(`profiles upsert warning: ${profileErr.message}`);
  }

  // 3. Mint an admin magic-link token and exchange it for a session via
  //    `verifyOtp`. Admin-issued tokens verify even when email/password
  //    sign-in is disabled at the project level.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
  });
  const hashedToken = linkData?.properties?.hashed_token;
  if (linkErr || !hashedToken) {
    throw new Error(
      `generateLink failed: ${linkErr?.message ?? "no hashed_token"}`,
    );
  }

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verifyData, error: verifyErr } = await userClient.auth.verifyOtp({
    token_hash: hashedToken,
    type: "magiclink",
  });
  if (verifyErr || !verifyData.session) {
    throw new Error(
      `verifyOtp failed: ${verifyErr?.message ?? "no session"}`,
    );
  }
  const session = verifyData.session;

  // 4. Inject the @supabase/ssr cookie format. Sessions usually fit in a
  //    single cookie (≤3180 bytes); if not we'd need to chunk into
  //    `sb-…-auth-token.0`/`.1` per @supabase/ssr's chunker. Bail if too big
  //    so the failure is loud rather than silent.
  const cookieName = `sb-${projectRef}-auth-token`;
  const sessionJson = JSON.stringify(session);
  const cookieValue = `base64-${Buffer.from(sessionJson, "utf8").toString("base64")}`;
  if (cookieValue.length > 3180) {
    throw new Error(
      `session cookie payload (${cookieValue.length} bytes) exceeds single-cookie limit; add chunking`,
    );
  }

  const baseHost = new URL(baseURL).hostname;
  await context.addCookies([
    {
      name: cookieName,
      value: cookieValue,
      domain: baseHost,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  // 5. Verify by visiting /dashboard. If the cookie shape is wrong, the
  //    layout's auth check will redirect us to /login and this assertion
  //    will fail with a clear "ended at /login" message.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);

  // 6. Save authenticated storage. Subsequent tests load it via `storageState`.
  await context.storageState({ path: STORAGE_FILE });
});
