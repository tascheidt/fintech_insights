import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { processJobStructureReprocessBatch } from "@/lib/labs/prompt-forge";
import { requireCronSecret } from "@/lib/auth/guards";
import { log } from "@/lib/log";

export const maxDuration = 300;

const bodySchema = z.object({
  jobRunId: z.string().uuid(),
});

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
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const body = parsed.data;

  try {
    const result = await processJobStructureReprocessBatch(body.jobRunId);

    if (!result.completed) {
      queueNextInvocation(req.nextUrl.origin, cronSecret, body.jobRunId).catch((error) => {
        log.error({ err: error }, "Prompt Forge reprocess chain error");
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
