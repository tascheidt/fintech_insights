import { NextRequest, NextResponse } from "next/server";
import type { FeedbackConfig } from "../types";
import { resolveConfig } from "../config";
import { adminPatchSchema, reviewStateFromLegacyDecision } from "../validation";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/** review_state -> the legacy admin_override_decision mirror, where one exists. */
const LEGACY_DECISION: Record<string, string | null> = {
  needs_review: null,
  approved: "accepted",
  rejected: "declined",
  shipped: "accepted",
};

/**
 * Create route handlers for admin feedback management.
 *
 * Returns { GET, PATCH } to be re-exported from your route.ts file:
 * ```
 * export const { GET, PATCH } = createAdminFeedbackHandlers(config);
 * ```
 *
 * GitHub issue creation deliberately does NOT live here — see
 * `createIssueHandler`. It used to be bolted onto the accept PATCH, which meant
 * the UI re-sent an "accept" purely to create an issue (re-stamping reviewed_by
 * and reviewed_at each time), and the only guard against a double-create was a
 * read-then-write check that two concurrent requests both passed.
 */
export function createAdminFeedbackHandlers(rawConfig: FeedbackConfig) {
  const config = resolveConfig(rawConfig);

  async function requireAdmin() {
    const supabase = await config.createServerClient();
    const user = await config.getUser(supabase);
    if (!user) {
      return {
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }

    const isAdmin = await config.isAdmin(supabase, user.id);
    if (!isAdmin) {
      return {
        error: NextResponse.json(
          { error: "Admin access required" },
          { status: 403 }
        ),
      };
    }

    return { supabase, user };
  }

  /** GET — Fetch feedback submissions (admin only), paginated */
  async function GET(req: NextRequest) {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { supabase } = auth;

    const { searchParams } = new URL(req.url);
    const reviewState = searchParams.get("review_state");
    const status = searchParams.get("status");

    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(searchParams.get("page_size")) || DEFAULT_PAGE_SIZE)
    );
    const page = Math.max(0, Number(searchParams.get("page")) || 0);
    const from = page * pageSize;

    const joinExpr = `${config.userTable}!${config.userForeignKey}(${config.userEmailColumn})`;

    let query = supabase
      .from("feedback_submissions")
      .select(
        `id, type, title, description, page_url, status, review_state,
         triage_decision, triage_confidence, triage_reasoning,
         triage_mapped_priority, triage_duplicate_of, triage_suggested_title,
         triage_suggested_labels, triage_completed_at, triage_error,
         generated_issue,
         admin_override_decision, admin_notes, reviewed_at,
         github_issue_number, github_issue_url,
         code_gen_triggered_at,
         created_at, updated_at,
         ${joinExpr}`,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    // review_state is the review queue's axis; `status` remains filterable for
    // the legacy AI-verdict view.
    if (reviewState) query = query.eq("review_state", reviewState);
    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      items: data ?? [],
      page,
      page_size: pageSize,
      total: count ?? 0,
      has_more: (count ?? 0) > from + (data?.length ?? 0),
    });
  }

  /** PATCH — Admin review actions (approve / reject / reopen / note) */
  async function PATCH(req: NextRequest) {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { supabase, user } = auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = adminPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { id, admin_notes } = parsed.data;
    const reviewState =
      parsed.data.review_state ??
      (parsed.data.admin_override_decision
        ? reviewStateFromLegacyDecision(parsed.data.admin_override_decision)
        : undefined);

    const updateData: Record<string, unknown> = {
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    };

    if (reviewState) {
      updateData.review_state = reviewState;
      // Keep the legacy mirror consistent. Reopening clears it: a reopened
      // submission has no standing human decision.
      updateData.admin_override_decision = LEGACY_DECISION[reviewState];
    }
    if (admin_notes !== undefined) {
      updateData.admin_notes = admin_notes;
    }

    const { data, error } = await supabase
      .from("feedback_submissions")
      .update(updateData)
      .eq("id", id)
      .select(
        "id, status, review_state, admin_override_decision, admin_notes, reviewed_at, github_issue_number, github_issue_url"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  return { GET, PATCH };
}
