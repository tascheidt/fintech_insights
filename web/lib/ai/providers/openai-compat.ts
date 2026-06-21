/**
 * Minimal OpenAI-compatible chat client for the open-model evaluation harness.
 *
 * Used to drive the SAME production prompts through a US-based OpenAI-compatible
 * host (Fireworks) so GLM-5.2 / DeepSeek V4-Flash can be scored against the
 * Gemini baseline without prompt drift. fetch-based — no SDK dependency.
 *
 * Eval-only: never wired into a production default. The seam in
 * `structure.ts` / `categorizer.ts` dispatches here only when handed an eval
 * model id (see `resolveProvider`).
 */

import type { GeminiUsageMetadata } from "@/lib/ai/gemini-meter";
import { getEvalModelSpec, resolveProviderModel } from "./registry";

export interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** Some providers report reasoning ("thinking") tokens here (DeepSeek/GLM). */
  completion_tokens_details?: { reasoning_tokens?: number };
}

/**
 * Map an OpenAI-style usage block onto the `gemini-meter` shape so the existing
 * `recordUsage` / pricing path can cost an open-model call unchanged. Reasoning
 * tokens (when reported) are folded into the total so the meter's residual
 * inference bills them at the output rate — mirroring how Gemini thinking
 * tokens are handled.
 */
export function mapOpenAiUsage(usage: OpenAiUsage | null | undefined): GeminiUsageMetadata {
  const prompt = usage?.prompt_tokens ?? 0;
  const completion = usage?.completion_tokens ?? 0;
  const reasoning = usage?.completion_tokens_details?.reasoning_tokens ?? 0;
  const total = usage?.total_tokens ?? prompt + completion + reasoning;
  return {
    promptTokenCount: prompt,
    candidatesTokenCount: completion,
    cachedContentTokenCount: 0,
    thoughtsTokenCount: reasoning > 0 ? reasoning : undefined,
    totalTokenCount: total,
  };
}

export interface OpenAiCompatRequest {
  /** Canonical eval model id (e.g. "glm-5.2"). */
  model: string;
  prompt: string;
  systemPrompt?: string;
  jsonMode?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface OpenAiCompatResult {
  text: string;
  usageMetadata: GeminiUsageMetadata;
  /** Reported under our canonical eval id so pricing + reports key consistently. */
  modelServed: string;
}

function baseUrl(): string {
  return process.env.FIREWORKS_BASE_URL ?? "https://api.fireworks.ai/inference/v1";
}

export function fireworksConfigured(): boolean {
  return Boolean(process.env.FIREWORKS_API_KEY);
}

export async function openAiCompatGenerate(
  req: OpenAiCompatRequest
): Promise<OpenAiCompatResult> {
  const spec = getEvalModelSpec(req.model);
  if (!spec) throw new Error(`Unknown eval model: ${req.model}`);
  const apiKey = process.env.FIREWORKS_API_KEY;
  if (!apiKey) throw new Error("FIREWORKS_API_KEY not configured");

  const providerModel = resolveProviderModel(spec);
  const messages = [
    ...(req.systemPrompt ? [{ role: "system", content: req.systemPrompt }] : []),
    { role: "user", content: req.prompt },
  ];

  const body: Record<string, unknown> = {
    model: providerModel,
    messages,
    temperature: req.temperature ?? 0.2,
    max_tokens: req.maxOutputTokens ?? 4096,
  };
  if (req.jsonMode) body.response_format = { type: "json_object" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 60000);
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Fireworks ${res.status} for ${providerModel}: ${errText.slice(0, 300)}`
    );
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: OpenAiUsage;
    model?: string;
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return {
    text,
    usageMetadata: mapOpenAiUsage(data.usage),
    modelServed: req.model,
  };
}
