import { test, expect } from "@playwright/test";

/**
 * Cross-company themes on the Jobs rail must:
 *   1. Render the editorial label (not the raw function-group key).
 *   2. Navigate to /jobs?function=<group> when clicked.
 *
 * Both assertions caught real bugs during the editorial-engine rollout —
 * RLS-blocked reads (label fell back to the group key) and dead chevrons
 * (no Link wrapper). This spec is the regression guard.
 */

test("cross-company themes link to filtered Jobs view", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-authed",
    "themes block requires auth"
  );

  await page.goto("/jobs");

  const themesSection = page.locator("section", {
    hasText: "Cross-company themes",
  });
  await expect(themesSection).toBeVisible({ timeout: 15000 });

  // At least one row should render an editorial label — i.e. NOT the raw
  // group keys ("Engineering", "Go-To-Market"). The labels we seed are
  // multi-word phrases like "Digital banking platform engineering".
  const links = themesSection.locator("a");
  const linkCount = await links.count();
  expect(linkCount).toBeGreaterThan(0);

  const first = links.first();
  const labelText = (await first.innerText()).split("\n")[0];
  expect(labelText.split(" ").length).toBeGreaterThanOrEqual(3);

  // The href must point at /jobs with a ?function= filter.
  const href = await first.getAttribute("href");
  expect(href).toMatch(/^\/jobs\?function=/);

  // Clicking the row must actually update the URL.
  await first.click();
  await expect(page).toHaveURL(/\/jobs\?function=/);
});
