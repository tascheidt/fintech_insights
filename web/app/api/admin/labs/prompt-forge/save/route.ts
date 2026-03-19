import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin";
import {
  JobStructureAiConfigSchema,
  TechStackAiConfigSchema,
  WeeklyDigestAiConfigSchema,
  savePromptConfig,
  validatePromptTemplate,
} from "@/lib/ai/prompt-config";
import { markPromptRunSaved } from "@/lib/labs/prompt-forge";

const requestSchema = z.object({
  runId: z.string().uuid().optional(),
  stage: z.enum(["job-structure", "tech-stack", "weekly-digest"]),
  benchmarkScore: z.number().min(0).max(100).nullable().optional(),
  config: z.unknown(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { user } = auth;

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

  const promptCheck = validatePromptTemplate(parsed.data.stage, configResult.data.promptTemplate);
  if (!promptCheck.isValid) {
    return NextResponse.json(
      {
        error: `Prompt is missing required placeholders: ${promptCheck.missingPlaceholders.join(", ")}`,
      },
      { status: 400 }
    );
  }

  try {
    await savePromptConfig({
      stage: parsed.data.stage,
      config: configResult.data,
      userId: user.id,
      benchmarkScore: parsed.data.benchmarkScore ?? null,
    });

    if (parsed.data.runId) {
      await markPromptRunSaved(parsed.data.runId);
    }

    return NextResponse.json({
      saved: true,
      stage: parsed.data.stage,
      model: configResult.data.model,
      benchmarkScore: parsed.data.benchmarkScore ?? null,
      config: configResult.data,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save prompt" },
      { status: 500 }
    );
  }
}
