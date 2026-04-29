/**
 * Multi-route, multi-width responsive audit for the table-y surfaces.
 * Visits each route at four widths (390 / 768 / 1024 / 1280) so a single
 * pass surfaces both mobile breakage AND the "tablet zone" between
 * mobile and desktop where the rail/grid math gets stressed.
 *
 * Off by default. Run with:
 *   TABLES_AUDIT=1 npx playwright test e2e/tables-audit.spec.ts \
 *     --project=chromium-authed
 */

import { test, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ENABLED = process.env.TABLES_AUDIT === "1";
const OUT = path.resolve(process.cwd(), "test-results/tables-audit");
fs.mkdirSync(OUT, { recursive: true });

// Module-level skip so Playwright doesn't even spawn the browser fixture
// for these tests when the audit isn't requested. Inline `test.skip(...)`
// runs after the fixture chain, which means a missing browser still
// crashes the test. CI doesn't set TABLES_AUDIT, so this short-circuits.
test.skip(!ENABLED, "TABLES_AUDIT=1 not set — audit disabled");

const ROUTES = [
  "/jobs",
  "/companies",
  "/companies/wealthsimple",
  "/companies/wealthsimple?tab=jobs",
  "/dashboard",
  "/admin",
];
const WIDTHS = [390, 768, 1024, 1280];

for (const route of ROUTES) {
  for (const w of WIDTHS) {
    const slug = route.replace(/^\//, "").replace(/\//g, "_") || "home";
    test(`${slug} @ ${w}px`, async ({ browser }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium-authed", "needs auth");
      const ctx = await browser.newContext({
        ...devices["Desktop Chrome"],
        viewport: { width: w, height: 900 },
        storageState: testInfo.project.use.storageState,
      });
      const p = await ctx.newPage();
      await p.goto(`http://localhost:3000${route}`, {
        waitUntil: "networkidle",
      });
      await p.waitForTimeout(400);
      await p.screenshot({
        path: path.join(OUT, `${slug}_${w}.png`),
        fullPage: false,
        clip: { x: 0, y: 0, width: w, height: 900 },
      });
      const stats = await p.evaluate((width) => {
        const docW = document.documentElement.scrollWidth;
        const offenders: Array<{ tag: string; cls: string; w: number }> = [];
        document.querySelectorAll("*").forEach((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          if (r.right > width + 1 && r.width > 60) {
            offenders.push({
              tag: el.tagName.toLowerCase(),
              cls:
                (el as HTMLElement).className?.toString().slice(0, 80) ?? "",
              w: Math.round(r.width),
            });
          }
        });
        return { docW, overflow: docW - width, offenders: offenders.slice(0, 5) };
      }, w);
      fs.writeFileSync(
        path.join(OUT, `${slug}_${w}.json`),
        JSON.stringify(stats, null, 2)
      );
      await ctx.close();
    });
  }
}
