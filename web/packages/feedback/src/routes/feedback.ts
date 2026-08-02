import { NextRequest, NextResponse } from "next/server";
import type { FeedbackConfig } from "../types";
import { resolveConfig } from "../config";
import { createFeedbackSchema } from "../validation";
import { notifyAdminsOfNewFeedback } from "../services/email";

/**
 * Create route handlers for user feedback submission and retrieval.
 *
 * Returns { POST, GET } to be re-exported from your route.ts file:
 * ```
 * export const { POST, GET } = createFeedbackHandlers(config);
 * ```
 */
export function createFeedbackHandlers(rawConfig: FeedbackConfig) {
  const config = resolveConfig(rawConfig);
  const feedbackSchema = createFeedbackSchema(config.feedbackTypes);

  /** POST — Submit user feedback */
  async function POST(req: NextRequest) {
    const supabase = await config.createServerClient();
    const user = await config.getUser(supabase);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const { type, title, description, pageUrl } = parsed.data;

    // Only the five user-authored columns are written here. `status` is
    // deliberately omitted so the column default ('submitted') supplies it —
    // the DB grant (migration 20260731093000) does not include `status`, and
    // sending it would be rejected. Every other column (triage_*,
    // generated_issue, admin_*, github_*) is service-role-only by the same
    // grant, which is what stops a client from bypassing this route and
    // PostgREST-inserting a pre-"accepted" row.
    const { data, error } = await supabase
      .from("feedback_submissions")
      .insert({
        user_id: user.id,
        type,
        title,
        description,
        page_url: pageUrl || null,
      })
      .select("id, status, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fire-and-forget: let the host app start downstream work (AI triage).
    // Deliberately not awaited and errors are swallowed — the row is already
    // committed, and a triage hiccup must not turn a successful submission into
    // a 500 for the user. A row whose triage never lands is visible as
    // status='submitted'/'reviewing' and can be re-run.
    void (async () => {
      try {
        await config.onSubmissionCreated?.({
          id: data.id,
          type,
          title,
          description,
          pageUrl: pageUrl || null,
          userId: user.id,
        });
      } catch {
        // intentionally ignored
      }
    })();

    // Fire-and-forget: notify admins via email (non-blocking)
    notifyAdminsOfNewFeedback(config, {
      title,
      type,
      description,
      submittedByEmail: user.email ?? "unknown",
      pageUrl: pageUrl || undefined,
    }).catch(() => {});

    return NextResponse.json(data, { status: 201 });
  }

  /** GET — Fetch current user's feedback submissions */
  async function GET() {
    const supabase = await config.createServerClient();
    const user = await config.getUser(supabase);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // `triage_reasoning`, `triage_confidence` and `triage_decision` are
    // deliberately NOT selected. They are internal classification output written
    // for an admin audience ("duplicate", "we haven't prioritized this"), and on
    // failure the old engine wrote raw Gemini error strings into
    // triage_reasoning — which this surface rendered verbatim to the person who
    // submitted the feedback. Users see the review state and, if an admin wrote
    // one, the admin's note. See docs/FEEDBACK_PIPELINE.md.
    const { data, error } = await supabase
      .from("feedback_submissions")
      .select(
        "id, type, title, description, review_state, admin_notes, github_issue_url, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  }

  return { POST, GET };
}
