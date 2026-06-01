import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noRawColor from "./eslint-rules/no-raw-color.js";
import activeCompanyScope from "./eslint-rules/active-company-scope.js";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "design-system": {
        rules: {
          "no-raw-color": noRawColor,
          "active-company-scope": activeCompanyScope,
        },
      },
    },
    rules: {
      // Phase 1: ship as warn so the migration can land without CI noise.
      // Promote to "error" once all Tailwind chart files and email templates
      // have been migrated to tokens.
      "design-system/no-raw-color": "warn",
    },
  },
  // Read-layer: any read of the base companies / job_postings tables must go
  // through the active_* views so deactivated companies never leak (the Monzo
  // incident). Writes are allowed (the rule lets `.insert/.update/.upsert/
  // .delete` through). Scoped to the surfaces that build user-facing reads;
  // admin / labs / ops / route code stays on the base tables by design. See
  // migration 20260601130000 and CLAUDE.md §"Company-active read scoping".
  {
    files: [
      "lib/dashboard-queries.ts",
      "lib/analysis/**/*.{ts,tsx}",
      "lib/ai/**/*.{ts,tsx}",
    ],
    rules: {
      "design-system/active-company-scope": "error",
    },
  },
  // Operational scripts, email templates, and the canonical email color map
  // have legitimate reasons to use loose typing, unused imports, and raw hex.
  // Email clients can't consume CSS variables; lib/email/colors.ts is the
  // single source of truth for those hex values and is intentionally exempt.
  {
    files: [
      "scripts/**/*.{ts,tsx,js,mjs}",
      "lib/email/colors.ts",
      "lib/email/templates/**/*.{ts,tsx}",
      "packages/feedback/src/services/email-template.{ts,tsx}",
      "packages/feedback/templates/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "design-system/no-raw-color": "off",
    },
  },
  // proxy.ts at the repo root needs `let` for some shadcn-style helpers.
  {
    files: ["proxy.ts"],
    rules: {
      "prefer-const": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "eslint-rules/**",
  ]),
]);

export default eslintConfig;
