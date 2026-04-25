import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { refreshTechStacksForCompanies, backfillTechStacksForAllCompanies } from "@/lib/jobs";
import { requireCronSecret } from "@/lib/auth/guards";
import { log } from "@/lib/log";

export const maxDuration = 300;

const bodySchema = z.object({
  jobRunId: z.string().uuid().nullable(),
});

/**
 * POST /api/internal/tech-stack-refresh
 * Internal endpoint to refresh tech stacks in a separate serverless invocation.
 *
 * Body:
 *   { jobRunId: string }  — refresh companies from a specific collection run
 *   { jobRunId: null }    — backfill all active companies with no tech stack
 *
 * Protected by CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
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
    if (body.jobRunId) {
      log.info({ jobRunId: body.jobRunId }, "Tech stack refresh started");
      const result = await refreshTechStacksForCompanies(body.jobRunId);
      log.info({ result }, "Tech stack refresh complete");
      return NextResponse.json({ success: true, ...result });
    } else {
      log.info("Tech stack backfill started for all companies");
      const result = await backfillTechStacksForAllCompanies();
      log.info({ result }, "Tech stack backfill complete");
      return NextResponse.json({ success: true, ...result });
    }
  } catch (error) {
    log.error({ err: error }, "Tech stack refresh/backfill error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
