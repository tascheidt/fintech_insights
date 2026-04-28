import { test, expect, devices } from "@playwright/test";

/**
 * Mobile nav contract:
 *   - Hamburger trigger is visible at mobile width.
 *   - Clicking it opens the side sheet with the primary nav links.
 *   - Tapping a link closes the sheet and routes to it.
 */

test.use({ ...devices["iPhone 13"] });

test("mobile nav hamburger opens the menu and routes to /jobs", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-authed",
    "needs auth to render the dashboard nav"
  );

  await page.goto("/dashboard");

  const hamburger = page.getByRole("button", { name: /open menu/i });
  await expect(hamburger).toBeVisible();
  await hamburger.click();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: /^jobs$/i })).toBeVisible();
  await expect(sheet.getByRole("link", { name: /^companies$/i })).toBeVisible();

  await sheet.getByRole("link", { name: /^jobs$/i }).click();
  await expect(page).toHaveURL(/\/jobs/);
});
