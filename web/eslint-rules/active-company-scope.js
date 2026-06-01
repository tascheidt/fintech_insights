/**
 * design-system/active-company-scope
 *
 * Forbids READING the base `companies` / `job_postings` tables directly in the
 * read-layer. Reads must go through the `active_companies` / `active_job_postings`
 * views (see migration 20260601130000_active_company_read_views.sql), which bake
 * in `companies.is_active = true`.
 *
 * WHY: two independent `is_active` axes exist and must not be conflated —
 *   - `companies.is_active`     (do we track this company at all / soft-delete)
 *   - `job_postings.is_active`  (is this specific requisition still open)
 * A deactivated company's postings often stay job-level `is_active=true` (no
 * cascade — flipping them would corrupt reactivation), so filtering the job axis
 * does NOT exclude a deactivated company. The Monzo incident: company inactive,
 * 51 job-active postings, leaked into Jobs search and cross-company aggregates.
 * The view is the canonical, forget-proof read surface; it also covers
 * service-role reads (which bypass RLS) and is the only one greppable in one place.
 *
 * This rule fires only on READS. Writes (`.insert` / `.update` / `.upsert` /
 * `.delete` chained on the `from(...)` result) are allowed on the base tables —
 * the views are read-only. Genuinely intentional base-table reads (admin /
 * reactivation paths that must see inactive companies) opt out explicitly:
 *   // eslint-disable-next-line design-system/active-company-scope -- <reason>
 *
 * Scoped via eslint.config.mjs to the read-layer dirs (dashboard-queries,
 * lib/analysis, lib/ai). Admin/labs/ops/route code is intentionally out of scope.
 */
"use strict";

const GUARDED_TABLES = new Set(["companies", "job_postings"]);
const WRITE_METHODS = new Set(["insert", "update", "upsert", "delete"]);

/** Walk up from a `.from("x")` CallExpression to see whether the builder chain
 *  it produces is terminated by a write method. `a.from("x").update(...)` parses
 *  as `((a.from("x")).update)(...)`, so the from-call is the object of an outer
 *  MemberExpression whose property is the write verb. */
function chainIsWrite(fromCall) {
  let node = fromCall;
  let parent = node.parent;
  // Hop over chained members/calls applied to the from() result.
  while (parent) {
    if (parent.type === "MemberExpression" && parent.object === node) {
      if (parent.property && WRITE_METHODS.has(parent.property.name)) return true;
      node = parent;
      parent = node.parent;
      continue;
    }
    if (parent.type === "CallExpression" && parent.callee === node) {
      node = parent;
      parent = node.parent;
      continue;
    }
    break;
  }
  return false;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Read companies/job_postings through the active_* views, not the base tables.",
    },
    schema: [],
    messages: {
      useView:
        'Read from the `active_{{table}}` view, not `.from("{{table}}")`, so deactivated companies are excluded (companies.is_active). The view bakes in the filter. If this read intentionally needs inactive rows (admin/reactivation), add: // eslint-disable-next-line design-system/active-company-scope -- <reason>',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          !callee ||
          callee.type !== "MemberExpression" ||
          callee.property.name !== "from"
        ) {
          return;
        }
        const arg = node.arguments[0];
        if (!arg || arg.type !== "Literal" || typeof arg.value !== "string") return;
        if (!GUARDED_TABLES.has(arg.value)) return;
        if (chainIsWrite(node)) return; // writes target base tables; views are read-only
        context.report({
          node,
          messageId: "useView",
          data: { table: arg.value },
        });
      },
    };
  },
};
