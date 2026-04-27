/**
 * design-system/no-raw-color
 *
 * Forbids raw color literals (hex, rgb(), hsl(), oklch(), oklab()) in TS/TSX/JS source.
 * The single source of truth for color is `web/app/globals.css`. Components must
 * reach for tokens — Tailwind utilities (`bg-primary`, `text-pacific-500`) or
 * CSS variables (`var(--gradient-coast)`).
 *
 * If a component needs a color that does not exist in the token system, add a
 * token to globals.css. Do NOT hardcode the hex.
 *
 * Allowed locations: `app/globals.css`, the eslint rule files themselves, SVG
 * icons (rare brand-color baked into a static asset), and test files.
 */
"use strict";

const COLOR_RE = /(#(?:[0-9a-f]{3,8})\b|rgba?\(|hsla?\(|oklch\(|oklab\()/i;

const ALLOWED_PATHS = [
  "/app/globals.css",
  "/eslint-rules/",
  ".svg",
  "/__tests__/",
  ".test.ts",
  ".test.tsx",
];

module.exports = {
  meta: {
    type: "suggestion",
    docs: { description: "Disallow raw color literals outside globals.css" },
    schema: [],
    messages: {
      rawColor:
        "Raw color literal `{{value}}`. Use a Tailwind token (bg-primary, text-pacific-500) or a CSS variable (var(--primary)) instead. Tokens live in app/globals.css.",
    },
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    if (ALLOWED_PATHS.some((p) => filename.includes(p))) return {};

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (COLOR_RE.test(node.value)) {
          context.report({ node, messageId: "rawColor", data: { value: node.value } });
        }
      },
      TemplateElement(node) {
        const raw = node.value && node.value.raw;
        if (raw && COLOR_RE.test(raw)) {
          context.report({ node, messageId: "rawColor", data: { value: raw } });
        }
      },
    };
  },
};
