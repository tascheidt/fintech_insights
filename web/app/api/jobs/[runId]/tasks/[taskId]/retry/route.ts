import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { retryTask } from "@/lib/jobs";
import { log } from "@/lib/log";

const paramsSchema = z.object({
  runId: z.string().uuid(),
  taskId: z.string().uuid(),
});

const bodySchema = z.object({
  fromStage: z.enum(["scrape", "ingest", "analyze", "done"]).optional(),
});

/**
 * POST /api/jobs/[runId]/tasks/[taskId]/retry
 * Retry a failed task from a specific stage
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string; taskId: string }> }
) {
  try {
    const paramsParsed = paramsSchema.safeParse(await params);
    if (!paramsParsed.success) {
      return NextResponse.json({ error: "Invalid params" }, { status: 400 });
    }
    const { taskId } = paramsParsed.data;

    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const { user, supabase } = auth;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!["editor", "admin"].includes(profile?.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      raw = {};
    }
    const bodyParsed = bodySchema.safeParse(raw);
    if (!bodyParsed.success) {
      return NextResponse.json(
        { error: "Invalid body", issues: bodyParsed.error.issues },
        { status: 400 }
      );
    }

    // Retry task (fire and forget)
    retryTask(taskId, bodyParsed.data.fromStage).catch((err) =>
      log.error({ err }, "retryTask failed")
    );

    return NextResponse.json({ success: true, message: "Task retry initiated" });
  } catch (error) {
    log.error({ err: error }, "Retry task error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
