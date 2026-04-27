/**
 * FUNCTION_GROUP_COLORS — chart series colors for the 8 function-category groups.
 *
 * Each value resolves to a CSS variable defined in `web/app/globals.css` under
 * the `--cat-*` family. To change a category color, edit the token in
 * `globals.css` (and `DESIGN_SYSTEM.md` if the meaning changes) — never
 * hardcode a hex here.
 */
export const FUNCTION_GROUP_COLORS = {
  "Engineering":              "var(--cat-engineering)",
  "Product & Design":         "var(--cat-product)",
  "Go-To-Market":             "var(--cat-gtm)",
  "Data & Analytics":         "var(--cat-data)",
  "Finance & Strategy":       "var(--cat-finance)",
  "Risk, Legal & Compliance": "var(--cat-risk)",
  "Operations & People":      "var(--cat-operations)",
  "Other":                    "var(--cat-other)",
};
