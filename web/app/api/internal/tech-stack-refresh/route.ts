import { NextRequest, NextResponse } from "next/server";
import { refreshTechStacksForCompanies, backfillTechStacksForAllCompanies } from "@/lib/jobs";

export const maxDuration = 300;

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
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { jobRunId: string | null };

  try {
    if (body.jobRunId) {
      console.log(`Tech stack refresh started for job run: ${body.jobRunId}`);
      const result = await refreshTechStacksForCompanies(body.jobRunId);
      console.log("Tech stack refresh complete:", result);
      return NextResponse.json({ success: true, ...result });
    } else {
      console.log("Tech stack backfill started for all companies");
      const result = await backfillTechStacksForAllCompanies();
      console.log("Tech stack backfill complete:", result);
      return NextResponse.json({ success: true, ...result });
    }
  } catch (error) {
    console.error("Tech stack refresh/backfill error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
