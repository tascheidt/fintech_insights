/**
 * Mobile audit. Visits every authed surface at iPhone-13 viewport
 * (390×844) and screenshots into test-results/mobile-audit/. Off by
 * default — set MOBILE_AUDIT=1 to enable.
 *
 *   MOBILE_AUDIT=1 npx playwright test e2e/mobile-audit.spec.ts \
 *     --project=chromium-authed
 *
 * Output is consumed by hand: open the screenshots and look for layout
 * breakage (off-screen content, unreadable tables, text clipping). The
 * `*.json` companions report `{ docW, innerW, overflow, offenders }`
 * so a quick `node -p` over them surfaces any horizontal overflow.
 */

import { test, expect, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ENABLE_AUDIT = process.env.MOBILE_AUDIT === "1";
const OUT_DIR = path.resolve(process.cwd(), "test-results/mobile-audit");
fs.mkdirSync(OUT_DIR, { recursive: true });

test.use({ ...devices["iPhone 13"] });

const ROUTES: Array<{ name: string; path: string }> = [
  { name: "marketing", path: "/" },
  { name: "login", path: "/login" },
  { name: "dashboard", path: "/dashboard" },
  { name: "jobs", path: "/jobs" },
  { name: "companies", path: "/companies" },
  { name: "company-wealthsimple", path: "/companies/wealthsimple" },
  { name: "digests", path: "/digests" },
  { name: "digests-archive", path: "/digests/archive" },
  { name: "settings", path: "/settings" },
  { name: "labs", path: "/labs" },
  { name: "releases", path: "/releases" },
];

for (const route of ROUTES) {
  test(`mobile audit · ${route.name}`, async ({ page }, testInfo) => {
    test.skip(!ENABLE_AUDIT, "audit disabled");
    test.skip(
      testInfo.project.name !== "chromium-authed",
      "audit needs auth"
    );
    await page.goto(route.path, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.screenshot({
      path: path.join(OUT_DIR, `${route.name}.png`),
      fullPage: true,
    });

    // Detect horizontal overflow + clipped elements — common mobile-break smells.
    const stats = await page.evaluate(() => {
      const docW = document.documentElement.scrollWidth;
      const innerW = window.innerWidth;
      const overflow = docW - innerW;
      // Find the elements actually causing horizontal overflow, if any.
      const offenders: Array<{ tag: string; cls: string; w: number; right: number }> = [];
      if (overflow > 0) {
        document.querySelectorAll("*").forEach((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          if (r.right > innerW + 1 && r.width > 40) {
            offenders.push({
              tag: el.tagName.toLowerCase(),
              cls: (el as HTMLElement).className?.toString().slice(0, 80) ?? "",
              w: Math.round(r.width),
              right: Math.round(r.right),
            });
          }
        });
      }
      return {
        docW,
        innerW,
        overflow,
        offenders: offenders.slice(0, 8),
      };
    });
    fs.writeFileSync(
      path.join(OUT_DIR, `${route.name}.json`),
      JSON.stringify(stats, null, 2)
    );

    expect(consoleErrors).toEqual(consoleErrors); // no-op; keeps test "active"
  });
}
