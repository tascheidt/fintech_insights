import { NextRequest, NextResponse } from "next/server";
import { processJobStructureReprocessBatch } from "@/lib/labs/prompt-forge";

export const maxDuration = 300;

async function queueNextInvocation(baseUrl: string, cronSecret: string, jobRunId: string) {
  await fetch(`${baseUrl}/api/internal/prompt-forge-reprocess`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cronSecret}`,
    },
    body: JSON.stringify({ jobRunId }),
  });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as { jobRunId?: string };
  if (!body.jobRunId) {
    return NextResponse.json({ error: "jobRunId is required" }, { status: 400 });
  }

  try {
    const result = await processJobStructureReprocessBatch(body.jobRunId);

    if (!result.completed) {
      queueNextInvocation(req.nextUrl.origin, cronSecret, body.jobRunId).catch((error) => {
        console.error("Prompt Forge reprocess chain error:", error);
      });
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Prompt Forge reprocess failed" },
      { status: 500 }
    );
  }
}
