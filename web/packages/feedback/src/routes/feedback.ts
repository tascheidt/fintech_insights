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

    const { data, error } = await supabase
      .from("feedback_submissions")
      .insert({
        user_id: user.id,
        type,
        title,
        description,
        page_url: pageUrl || null,
        status: "submitted",
      })
      .select("id, status, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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

    const { data, error } = await supabase
      .from("feedback_submissions")
      .select(
        "id, type, title, description, status, triage_decision, triage_confidence, triage_reasoning, triage_suggested_title, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  }

  return { POST, GET };
}
