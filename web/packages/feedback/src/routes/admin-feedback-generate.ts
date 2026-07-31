import { NextRequest, NextResponse } from "next/server";
import type { FeedbackConfig } from "../types";
import { resolveConfig } from "../config";
import { triggerCodeGenWorkflow } from "../services/github";

/**
 * Create a route handler for triggering code generation on accepted feedback.
 *
 * Returns { POST } to be re-exported from your route.ts file:
 * ```
 * export const { POST } = createCodeGenHandler(config);
 * ```
 */
export function createCodeGenHandler(rawConfig: FeedbackConfig) {
  const config = resolveConfig(rawConfig);

  /** POST — Trigger auto-implement workflow for accepted feedback */
  async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const supabase = await config.createServerClient();
    const user = await config.getUser(supabase);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = await config.isAdmin(supabase, user.id);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    if (!config.github) {
      return NextResponse.json(
        { error: "GitHub integration not configured" },
        { status: 400 }
      );
    }

    const { id } = await params;

    const { data: feedback, error } = await supabase
      .from("feedback_submissions")
      .select("id, review_state, github_issue_number, code_gen_triggered_at")
      .eq("id", id)
      .single();

    if (error || !feedback) {
      return NextResponse.json(
        { error: "Feedback not found" },
        { status: 404 }
      );
    }

    if (!feedback.github_issue_number) {
      return NextResponse.json(
        { error: "No GitHub issue linked to this feedback" },
        { status: 400 }
      );
    }

    if (feedback.review_state !== "shipped") {
      return NextResponse.json(
        { error: "Feedback must have an issue opened before generating code" },
        { status: 409 }
      );
    }

    // Whether code generation had already run lived only in React state, so a
    // page refresh re-armed the button and a second click dispatched another
    // workflow run — and therefore opened another PR against the same issue.
    // The stamp below is the durable guard. `force` exists because a genuinely
    // failed run is a legitimate reason to dispatch again.
    const force = new URL(_req.url).searchParams.get("force") === "true";
    if (feedback.code_gen_triggered_at && !force) {
      return NextResponse.json(
        {
          error: "Code generation already triggered for this issue",
          triggered_at: feedback.code_gen_triggered_at,
          hint: "Re-run with ?force=true if the previous workflow failed",
        },
        { status: 409 }
      );
    }

    try {
      await triggerCodeGenWorkflow(config.github, feedback.github_issue_number);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to trigger workflow";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    await supabase
      .from("feedback_submissions")
      .update({
        code_gen_triggered_at: new Date().toISOString(),
        code_gen_triggered_by: user.id,
      })
      .eq("id", id);

    return NextResponse.json({
      triggered: true,
      issue_number: feedback.github_issue_number,
    });
  }

  return { POST };
}
