import { test, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Probes the Jobs table at multiple widths to find where the layout breaks.
 * Run with: WIDTHS_PROBE=1 npx playwright test e2e/jobs-table-widths.spec.ts
 */
const ENABLED = process.env.WIDTHS_PROBE === "1";
const OUT = path.resolve(process.cwd(), "test-results/jobs-widths");
fs.mkdirSync(OUT, { recursive: true });

const WIDTHS = [390, 640, 768, 1024, 1200, 1440];

test.use({ ...devices["Desktop Chrome"] });

for (const w of WIDTHS) {
  test(`jobs at ${w}px`, async ({ browser }, testInfo) => {
    test.skip(!ENABLED, "widths probe disabled");
    test.skip(testInfo.project.name !== "chromium-authed", "needs auth");
    const ctx = await browser.newContext({
      ...devices["Desktop Chrome"],
      viewport: { width: w, height: 900 },
      storageState: testInfo.project.use.storageState,
    });
    const p = await ctx.newPage();
    await p.goto("http://localhost:3000/jobs", { waitUntil: "networkidle" });
    await p.waitForTimeout(400);
    await p.screenshot({
      path: path.join(OUT, `${w}.png`),
      fullPage: false,
      clip: { x: 0, y: 0, width: w, height: 900 },
    });
    const stats = await p.evaluate(() => ({
      docW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    }));
    fs.writeFileSync(
      path.join(OUT, `${w}.json`),
      JSON.stringify({ ...stats, overflow: stats.docW - stats.innerW })
    );
    await ctx.close();
  });
}
