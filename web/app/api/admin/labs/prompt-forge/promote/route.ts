import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin";
import {
  JobStructureAiConfigSchema,
  TechStackAiConfigSchema,
  WeeklyDigestAiConfigSchema,
} from "@/lib/ai/prompt-config";
import { promotePromptConfig } from "@/lib/labs/prompt-forge";

const requestSchema = z.object({
  runId: z.string().uuid(),
  stage: z.enum(["job-structure", "tech-stack", "weekly-digest"]),
  score: z.number().min(0).max(100),
  metrics: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      value: z.number(),
      tone: z.enum(["good", "warn", "bad"]),
      helper: z.string(),
    })
  ),
  triggerCodegen: z.boolean().optional(),
  config: z.unknown(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const configResult =
    parsed.data.stage === "job-structure"
      ? JobStructureAiConfigSchema.safeParse(parsed.data.config)
      : parsed.data.stage === "tech-stack"
        ? TechStackAiConfigSchema.safeParse(parsed.data.config)
        : WeeklyDigestAiConfigSchema.safeParse(parsed.data.config);

  if (!configResult.success) {
    return NextResponse.json(
      { error: configResult.error.issues[0]?.message ?? "Invalid config" },
      { status: 400 }
    );
  }

  try {
    const issue = await promotePromptConfig({
      runId: parsed.data.runId,
      stage: parsed.data.stage,
      model: configResult.data.model,
      promptTemplate: configResult.data.promptTemplate,
      score: parsed.data.score,
      metrics: parsed.data.metrics,
      triggerCodegen: parsed.data.triggerCodegen,
    });

    return NextResponse.json({
      issueNumber: issue.number,
      issueUrl: issue.html_url,
      codegenTriggered: Boolean(parsed.data.triggerCodegen),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to promote prompt" },
      { status: 500 }
    );
  }
}
