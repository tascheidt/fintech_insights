/**
 * FunctionDot — 7px color-coded dot indicating the function group of a job.
 *
 * Maps an arbitrary function string (canonical RoleCategory or one of the
 * informal labels used in v2 mocks like "Customer", "Marketing") to a
 * `bg-cat-*` Tailwind utility backed by a CSS variable in `globals.css`.
 *
 * Reference: usage in /tmp/design-package-v2/.../JobsList_v2.jsx beside
 * each job title.
 */

import { cn } from "@/lib/utils";
import {
  getCategoryGroup,
  ROLE_CATEGORIES,
  type RoleCategory,
} from "@/lib/analysis/function-categories";

const GROUP_TO_BG: Record<string, string> = {
  Engineering: "bg-cat-engineering",
  "Product & Design": "bg-cat-product",
  "Data & Analytics": "bg-cat-data",
  "Risk, Legal & Compliance": "bg-cat-risk",
  "Go-To-Market": "bg-cat-gtm",
  "Finance & Strategy": "bg-cat-finance",
  "Operations & People": "bg-cat-operations",
  Other: "bg-cat-other",
};

// Map informal labels used in v2 mocks (and other non-canonical strings)
// to category groups.
const LABEL_TO_GROUP: Record<string, string> = {
  Customer: "Go-To-Market",
  Marketing: "Go-To-Market",
  Sales: "Go-To-Market",
  Support: "Operations & People",
  Ops: "Operations & People",
  People: "Operations & People",
  HR: "Operations & People",
  Eng: "Engineering",
  Engineering: "Engineering",
  Product: "Product & Design",
  Design: "Product & Design",
  Data: "Data & Analytics",
  Analytics: "Data & Analytics",
  Risk: "Risk, Legal & Compliance",
  Compliance: "Risk, Legal & Compliance",
  Legal: "Risk, Legal & Compliance",
  Finance: "Finance & Strategy",
  Strategy: "Finance & Strategy",
};

export interface FunctionDotProps {
  fn: string;
  className?: string;
}

function resolveBg(fn: string): string {
  if (!fn) return GROUP_TO_BG.Other;

  // Canonical RoleCategory string (e.g. "engineering-backend")
  if ((ROLE_CATEGORIES as readonly string[]).includes(fn)) {
    const group = getCategoryGroup(fn as RoleCategory);
    return GROUP_TO_BG[group] ?? GROUP_TO_BG.Other;
  }

  // Already a category group label (e.g. "Engineering")
  if (GROUP_TO_BG[fn]) return GROUP_TO_BG[fn];

  // Informal short label
  const group = LABEL_TO_GROUP[fn];
  if (group) return GROUP_TO_BG[group] ?? GROUP_TO_BG.Other;

  return GROUP_TO_BG.Other;
}

export function FunctionDot({ fn, className }: FunctionDotProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 rounded-full",
        resolveBg(fn),
        className
      )}
      style={{ width: 7, height: 7 }}
    />
  );
}
