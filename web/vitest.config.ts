import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Vitest config for the web app.
 *
 * Philosophy (see docs/AGENTS.md#Tests): regression protection on the
 * highest-leverage pure functions, not a coverage chase. The full unit-test
 * surface is intentionally tiny (six files); cron handlers and other
 * mock-heavy boundaries are covered by Playwright + production telemetry,
 * not Vitest.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirror the `@/*` -> `./*` mapping from tsconfig.json so test
      // imports resolve the same way they do under `next build`.
      "@": path.resolve(__dirname, "./"),
      // Local workspace package — points at the source entry rather than
      // the published build so tests pick up edits immediately.
      "@tascheidt/feedback": path.resolve(__dirname, "./packages/feedback/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    // Keep tests narrowly scoped — colocated *.test.ts files only.
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "e2e/**", "packages/feedback/dist/**"],
  },
});
