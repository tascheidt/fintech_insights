import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin";
import {
  JobStructureAiConfigSchema,
  TechStackAiConfigSchema,
  WeeklyDigestAiConfigSchema,
  validatePromptTemplate,
} from "@/lib/ai/prompt-config";
import {
  evaluateJobStructurePrompt,
  evaluateTechStackPrompt,
  evaluateWeeklyDigestPrompt,
  savePromptForgeRun,
} from "@/lib/labs/prompt-forge";

export const maxDuration = 180;

const requestSchema = z.object({
  stage: z.enum(["job-structure", "tech-stack", "weekly-digest"]),
  companyId: z.string().uuid(),
  arena: z.string().min(2).max(50),
  sampleSize: z.number().int().min(1).max(12).optional(),
  config: z.unknown(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

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

  const { stage, companyId, arena, sampleSize } = parsed.data;
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  try {
    if (stage === "job-structure") {
      const configResult = JobStructureAiConfigSchema.safeParse(parsed.data.config);
      if (!configResult.success) {
        return NextResponse.json(
          { error: configResult.error.issues[0]?.message ?? "Invalid config" },
          { status: 400 }
        );
      }

      const promptCheck = validatePromptTemplate(stage, configResult.data.promptTemplate);
      if (!promptCheck.isValid) {
        return NextResponse.json(
          {
            error: `Prompt is missing required placeholders: ${promptCheck.missingPlaceholders.join(", ")}`,
          },
          { status: 400 }
        );
      }

      const result = await evaluateJobStructurePrompt({
        companyId,
        companyName: company.name,
        sampleSize: sampleSize ?? 6,
        arena,
        candidateConfig: configResult.data,
      });

      const run = await savePromptForgeRun({
        stage,
        arena,
        companyId,
        companyName: company.name,
        model: configResult.data.model,
        candidateConfig: configResult.data,
        baselineConfig: result.baselineConfig,
        candidateOutput: result.candidateOutput,
        baselineOutput: result.baselineOutput,
        battle: result.candidate,
        userId: user.id,
      });

      return NextResponse.json({
        ...result,
        runId: run.id,
        runCreatedAt: run.created_at,
      });
    }

    if (stage === "tech-stack") {
      const configResult = TechStackAiConfigSchema.safeParse(parsed.data.config);
      if (!configResult.success) {
        return NextResponse.json(
          { error: configResult.error.issues[0]?.message ?? "Invalid config" },
          { status: 400 }
        );
      }

      const promptCheck = validatePromptTemplate(stage, configResult.data.promptTemplate);
      if (!promptCheck.isValid) {
        return NextResponse.json(
          {
            error: `Prompt is missing required placeholders: ${promptCheck.missingPlaceholders.join(", ")}`,
          },
          { status: 400 }
        );
      }

      const result = await evaluateTechStackPrompt({
        companyId,
        companyName: company.name,
        arena,
        candidateConfig: configResult.data,
      });

      const run = await savePromptForgeRun({
        stage,
        arena,
        companyId,
        companyName: company.name,
        model: configResult.data.model,
        candidateConfig: configResult.data,
        baselineConfig: result.baselineConfig,
        candidateOutput: result.candidateOutput,
        baselineOutput: result.baselineOutput,
        battle: result.candidate,
        userId: user.id,
      });

      return NextResponse.json({
        ...result,
        runId: run.id,
        runCreatedAt: run.created_at,
      });
    }

    const configResult = WeeklyDigestAiConfigSchema.safeParse(parsed.data.config);
    if (!configResult.success) {
      return NextResponse.json(
        { error: configResult.error.issues[0]?.message ?? "Invalid config" },
        { status: 400 }
      );
    }

    const promptCheck = validatePromptTemplate(stage, configResult.data.promptTemplate);
    if (!promptCheck.isValid) {
      return NextResponse.json(
        {
          error: `Prompt is missing required placeholders: ${promptCheck.missingPlaceholders.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const result = await evaluateWeeklyDigestPrompt({
      companyId,
      companyName: company.name,
      arena,
      candidateConfig: configResult.data,
    });

    const run = await savePromptForgeRun({
      stage,
      arena,
      companyId,
      companyName: company.name,
      model: configResult.data.model,
      candidateConfig: configResult.data,
      baselineConfig: result.baselineConfig,
      candidateOutput: result.candidateOutput,
      baselineOutput: result.baselineOutput,
      battle: result.candidate,
      userId: user.id,
    });

    return NextResponse.json({
      ...result,
      runId: run.id,
      runCreatedAt: run.created_at,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Evaluation failed" },
      { status: 500 }
    );
  }
}
