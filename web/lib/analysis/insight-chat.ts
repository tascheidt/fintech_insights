/**
 * Company-insight chat (company page → "Ask about this insight"). User-facing,
 * so the chat voice directive applies. Extracted from the API route so the
 * model eval suite can drive the exact production prompt with fixtures.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { modelFor } from "@/lib/ai/prompt-config";
import { getVoiceDirective } from "@/lib/ai/voice";
import { recordUsage } from "@/lib/ai/gemini-meter";
import { writeUsageEvent } from "@/lib/ai/gemini-telemetry";

/** The insight fields the chat prompt reads. */
export interface ChatInsightContext {
  analysis_period_start: string;
  analysis_period_end: string;
  executive_summary: string | null;
  strategic_hypothesis: string | null;
  core_functions?: unknown[] | null;
  stated_strategy?: string | null;
  alignment_analysis: string | null;
  discrepancies: unknown;
  strategic_implications: string | null;
}

export function buildCompanyInsightChatPrompt(input: {
  companyName: string;
  insight: ChatInsightContext;
  history: Array<{ role: string; content: string }>;
  message: string;
}): string {
  const { companyName: name, insight, history: existingMessages, message } = input;
  // Build context from insight
  const insightContext = `
Company: ${name}
Analysis Period: ${new Date(insight.analysis_period_start).toLocaleDateString()} - ${new Date(insight.analysis_period_end).toLocaleDateString()}

Executive Summary:
${insight.executive_summary}

Strategic Hypothesis:
${insight.strategic_hypothesis}

Core Functions Being Hired:
${JSON.stringify(insight.core_functions?.slice(0, 10), null, 2)}

Stated Strategy:
${insight.stated_strategy || "Not available"}

Alignment Analysis:
${insight.alignment_analysis}

Discrepancies:
${JSON.stringify(insight.discrepancies, null, 2)}

Strategic Implications:
${insight.strategic_implications}
`;

  // Build conversation history
  const conversationHistory = existingMessages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const prompt = `${getVoiceDirective("chat")}

You are a competitive intelligence analyst helping a user understand this company insight analysis.

## Company Insight Context
${insightContext}

## Conversation History
${conversationHistory || "No previous messages."}

## User's Question
${message}

Provide a helpful, insightful response based on the company insight data. Be specific and reference the data when relevant. If you don't have enough information to answer, say so.`;
  return prompt;
}

/** One chat turn. Writes telemetry like every other call site. */
export async function generateCompanyInsightChatReply(
  prompt: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: modelFor("insight-chat"),
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 16384,
    },
  });

  const _chatStartMs = Date.now();
  const result = await model.generateContent(prompt);

  writeUsageEvent(
    recordUsage({
      callSite: "companyInsightChat",
      modelRequested: modelFor("insight-chat"),
      groundingEnabled: false,
      usageMetadata: result.response.usageMetadata,
      latencyMs: Date.now() - _chatStartMs,
      status: "ok",
      extra,
    })
  );

  return result.response.text()?.trim() || "I apologize, but I couldn't generate a response.";
}
