import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin";
import {
  createJobStructureReprocessRun,
  executeJobStructureReprocessRun,
} from "@/lib/labs/prompt-forge";

export const maxDuration = 300;

const requestSchema = z.object({
  companyId: z.string().uuid().optional(),
  activeOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(5000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  try {
    const job = await createJobStructureReprocessRun({
      companyId: parsed.data.companyId,
      activeOnly: parsed.data.activeOnly,
      limit: parsed.data.limit,
      triggeredBy: user.id,
    });

    void executeJobStructureReprocessRun(job.jobRunId, {
      companyId: parsed.data.companyId,
      activeOnly: parsed.data.activeOnly,
      limit: parsed.data.limit,
    }).catch((error) => {
      console.error("Prompt Forge reprocess job failed:", error);
    });

    return NextResponse.json({
      started: true,
      jobRunId: job.jobRunId,
      totalJobs: job.totalJobs,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reprocess jobs" },
      { status: 500 }
    );
  }
}
