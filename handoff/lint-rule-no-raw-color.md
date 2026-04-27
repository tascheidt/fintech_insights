# Lint rule — no raw colors outside the tokens file

This rule prevents drift back into hex codes and one-off OKLCH values once the
SoCal palette ships. Add it before phase 2 begins.

## ESLint custom rule

Save as `web/eslint-rules/no-raw-color.js`:

```js
/**
 * Forbids raw color literals (hex, rgb(), hsl(), oklch()) in TSX/TS source.
 * Allowed only in: app/globals.css, the SVG icon files, and explicitly
 * marked design-system files.
 *
 * Catches:
 *   color: "#3b82f6"
 *   style={{ background: "rgb(59, 130, 246)" }}
 *   const c = "oklch(0.5 0.1 200)";
 *
 * Use a token instead:
 *   className="bg-primary"
 *   style={{ background: "var(--primary)" }}
 */
"use strict";

const COLOR_RE = /(#(?:[0-9a-f]{3,8})\b|rgba?\(|hsla?\(|oklch\(|oklab\()/i;

const ALLOWED_PATHS = [
  "/app/globals.css",
  "/eslint-rules/",
  ".svg",
  "/__tests__/",
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
    const filename = context.getFilename();
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
```

## Wiring it up in `web/eslint.config.mjs`

```js
import noRawColor from "./eslint-rules/no-raw-color.js";

export default [
  // …existing config…
  {
    plugins: {
      "design-system": {
        rules: { "no-raw-color": noRawColor },
      },
    },
    rules: {
      "design-system/no-raw-color": "error",
    },
  },
];
```

## Inline escape hatch (use sparingly)

For genuinely-one-off cases (a brand-color avatar from a remote company logo,
chart series specifically requiring a certain hue), allow per-line:

```ts
// eslint-disable-next-line design-system/no-raw-color
const accent = "#ff6b35";
```

Reviewers should challenge every escape hatch in PR review. If it appears
twice, it should become a token.

## CSS coverage

ESLint doesn't lint CSS. To catch the same pattern in `.css` files, add
**stylelint** with the `color-no-hex` and `unit-allowed-list` rules:

```json
{
  "rules": {
    "color-no-hex": [true, { "ignore": ["named"] }],
    "color-named": "never",
    "color-function-notation": "modern"
  }
}
```

Apply this only to `web/components/**/*.css` and `web/app/**/*.css` —
explicitly exclude `web/app/globals.css` so the tokens themselves can use
OKLCH literals.
