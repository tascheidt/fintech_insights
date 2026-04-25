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
      .select("id, status, github_issue_number")
      .eq("id", id)
      .single();

    if (error || !feedback) {
      return NextResponse.json(
        { error: "Feedback not found" },
        { status: 404 }
      );
    }

    if (feedback.status !== "accepted") {
      return NextResponse.json(
        { error: "Feedback must be accepted before generating code" },
        { status: 400 }
      );
    }

    if (!feedback.github_issue_number) {
      return NextResponse.json(
        { error: "No GitHub issue linked to this feedback" },
        { status: 400 }
      );
    }

    try {
      await triggerCodeGenWorkflow(config.github, feedback.github_issue_number);
      return NextResponse.json({
        triggered: true,
        issue_number: feedback.github_issue_number,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to trigger workflow";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return { POST };
}
