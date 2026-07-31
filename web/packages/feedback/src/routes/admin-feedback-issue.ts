import { NextRequest, NextResponse } from "next/server";
import type { FeedbackConfig } from "../types";
import { resolveConfig } from "../config";
import { createGitHubIssue } from "../services/github";

/**
 * Create a route handler that opens a GitHub issue for a reviewed submission.
 *
 * Split out of the admin PATCH handler, where it had been bolted onto the
 * "accept" action. Three things were wrong with that arrangement:
 *
 *   1. The client re-sent `admin_override_decision: 'accepted'` on an already
 *      approved row purely to trigger issue creation, re-stamping reviewed_by
 *      and reviewed_at on every attempt.
 *   2. The only guard against a duplicate issue was reading github_issue_number
 *      and checking it was null — two concurrent requests both passed. A partial
 *      unique index now backstops this at the database level.
 *   3. On failure the PATCH returned **200** with a `github_error` field in the
 *      body. One of the two client call paths read it; the other silently
 *      treated the response as success, leaving a row approved with no issue and
 *      no visible error.
 *
 * This handler returns a real status code on failure.
 */
export function createIssueHandler(rawConfig: FeedbackConfig) {
  const config = resolveConfig(rawConfig);

  async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const supabase = await config.createServerClient();
    const user = await config.getUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await config.isAdmin(supabase, user.id))) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
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
      .select(
        "id, review_state, title, triage_suggested_title, generated_issue, type, triage_suggested_labels, github_issue_number, github_issue_url"
      )
      .eq("id", id)
      .single();

    if (error || !feedback) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    // Idempotent: an existing issue is a success, not a conflict, so a
    // double-click or a retry after a flaky response is harmless.
    if (feedback.github_issue_number) {
      return NextResponse.json({
        already_existed: true,
        github_issue_number: feedback.github_issue_number,
        github_issue_url: feedback.github_issue_url,
      });
    }

    if (feedback.review_state !== "approved") {
      return NextResponse.json(
        { error: "Submission must be approved before opening an issue" },
        { status: 409 }
      );
    }

    if (!feedback.generated_issue) {
      return NextResponse.json(
        { error: "No generated issue content — run triage first" },
        { status: 409 }
      );
    }

    const labels = [
      "feedback",
      feedback.type,
      ...((feedback.triage_suggested_labels as string[] | null) ?? []),
    ].filter(Boolean);

    let issue: { number: number; html_url: string };
    try {
      issue = await createGitHubIssue(config.github, {
        title: feedback.triage_suggested_title || feedback.title,
        body: feedback.generated_issue,
        labels,
      });
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Unknown error creating GitHub issue",
        },
        { status: 502 }
      );
    }

    const { error: updateError } = await supabase
      .from("feedback_submissions")
      .update({
        github_issue_number: issue.number,
        github_issue_url: issue.html_url,
        review_state: "shipped",
      })
      .eq("id", id);

    if (updateError) {
      // The issue exists on GitHub but we failed to record it. Say so plainly
      // rather than reporting a clean success — the next attempt would
      // otherwise open a second issue.
      return NextResponse.json(
        {
          error: `Issue #${issue.number} was created but could not be linked: ${updateError.message}`,
          github_issue_number: issue.number,
          github_issue_url: issue.html_url,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      github_issue_number: issue.number,
      github_issue_url: issue.html_url,
      review_state: "shipped",
    });
  }

  return { POST };
}
