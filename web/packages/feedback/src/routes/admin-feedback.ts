import { NextRequest, NextResponse } from "next/server";
import type { FeedbackConfig } from "../types";
import { resolveConfig } from "../config";
import { adminPatchSchema } from "../validation";
import { createGitHubIssue } from "../services/github";

/**
 * Create route handlers for admin feedback management.
 *
 * Returns { GET, PATCH } to be re-exported from your route.ts file:
 * ```
 * export const { GET, PATCH } = createAdminFeedbackHandlers(config);
 * ```
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

  /** GET — Fetch all feedback submissions (admin only) */
  async function GET(req: NextRequest) {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { supabase } = auth;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    // Build the FK join dynamically from config
    const joinExpr = `${config.userTable}!${config.userForeignKey}(${config.userEmailColumn})`;

    let query = supabase
      .from("feedback_submissions")
      .select(
        `id, type, title, description, page_url, status,
         triage_decision, triage_confidence, triage_reasoning,
         triage_mapped_priority, triage_duplicate_of, triage_suggested_title,
         triage_suggested_labels, triage_completed_at, generated_issue,
         admin_override_decision, admin_notes, reviewed_at,
         github_issue_number, github_issue_url,
         created_at, updated_at,
         ${joinExpr}`
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  }

  /** PATCH — Admin actions on feedback (accept/decline/note) */
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

    const { id, admin_override_decision, admin_notes } = parsed.data;

    const updateData: Record<string, unknown> = {
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    };

    if (admin_override_decision) {
      updateData.admin_override_decision = admin_override_decision;
      updateData.status = admin_override_decision;
    }
    if (admin_notes !== undefined) {
      updateData.admin_notes = admin_notes;
    }

    const { data, error } = await supabase
      .from("feedback_submissions")
      .update(updateData)
      .eq("id", id)
      .select(
        "id, status, admin_override_decision, admin_notes, reviewed_at, github_issue_number, github_issue_url"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-create GitHub issue when admin accepts feedback
    if (
      admin_override_decision === "accepted" &&
      !data.github_issue_number &&
      config.github
    ) {
      try {
        const { data: feedback } = await supabase
          .from("feedback_submissions")
          .select(
            "title, triage_suggested_title, generated_issue, type, triage_suggested_labels"
          )
          .eq("id", id)
          .single();

        if (!feedback?.generated_issue) {
          return NextResponse.json({
            ...data,
            github_error:
              "No generated issue content \u2014 run AI triage first",
          });
        }

        const labels = [
          "feedback",
          feedback.type,
          ...(feedback.triage_suggested_labels ?? []),
        ].filter(Boolean);

        const issue = await createGitHubIssue(config.github, {
          title: feedback.triage_suggested_title || feedback.title,
          body: feedback.generated_issue,
          labels,
        });

        await supabase
          .from("feedback_submissions")
          .update({
            github_issue_number: issue.number,
            github_issue_url: issue.html_url,
          })
          .eq("id", id);

        data.github_issue_number = issue.number;
        data.github_issue_url = issue.html_url;
      } catch (err) {
        console.error("Failed to create GitHub issue:", err);
        return NextResponse.json({
          ...data,
          github_error:
            err instanceof Error
              ? err.message
              : "Unknown error creating GitHub issue",
        });
      }
    }

    return NextResponse.json(data);
  }

  return { GET, PATCH };
}
