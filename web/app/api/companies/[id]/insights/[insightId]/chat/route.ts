import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getVoiceDirective } from "@/lib/ai/voice";
import { recordUsage } from "@/lib/ai/gemini-meter";
import { writeUsageEvent } from "@/lib/ai/gemini-telemetry";
import { requireUser } from "@/lib/auth/guards";
import { log } from "@/lib/log";
import { z } from "zod";

const messageSchema = z.object({
  message: z.string().min(1).max(2000),
});

const paramsSchema = z.object({
  id: z.string().uuid(),
  insightId: z.string().uuid(),
});

/**
 * POST /api/companies/[id]/insights/[insightId]/chat
 * Add a message to a company insight conversation
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; insightId: string }> }
) {
  const paramsParsed = paramsSchema.safeParse(await params);
  if (!paramsParsed.success) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }
  const { id, insightId } = paramsParsed.data;

  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  // Verify user has access to this company
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", id)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // Parse request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { message } = parsed.data;

  // Get the insight
  const adminSupabase = createAdminClient();
  const { data: insight, error: insightError } = await adminSupabase
    .from("company_insights")
    .select("*")
    .eq("id", insightId)
    .eq("company_id", id)
    .single();

  if (insightError || !insight) {
    return NextResponse.json({ error: "Insight not found" }, { status: 404 });
  }

  // Get or create conversation
  let { data: conversation } = await adminSupabase
    .from("company_insight_conversations")
    .select("*")
    .eq("company_insight_id", insightId)
    .eq("user_id", user.id)
    .single();

  if (!conversation) {
    const { data: newConversation, error: createError } = await adminSupabase
      .from("company_insight_conversations")
      .insert({
        company_insight_id: insightId,
        user_id: user.id,
        messages: [],
      })
      .select()
      .single();

    if (createError) {
      log.error({ err: createError }, "Error creating conversation");
      return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
    }
    conversation = newConversation;
  }

  // Get existing messages
  const existingMessages = (conversation.messages as Array<{ role: string; content: string }>) || [];

  // Generate AI response
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "AI not configured" }, { status: 500 });
  }

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 16384,
      },
    });

    // Build context from insight
    const insightContext = `
Company: ${company.name}
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

    const _chatStartMs = Date.now();
    const result = await model.generateContent(prompt);

    writeUsageEvent(
      recordUsage({
        callSite: "companyInsightChat",
        modelRequested: "gemini-flash-latest",
        groundingEnabled: false,
        usageMetadata: result.response.usageMetadata,
        latencyMs: Date.now() - _chatStartMs,
        status: "ok",
        extra: { companyId: company.id, insightId: insight.id },
      })
    );

    const aiResponse = result.response.text()?.trim() || "I apologize, but I couldn't generate a response.";

    // Update conversation with new messages
    const updatedMessages = [
      ...existingMessages,
      { role: "user", content: message, timestamp: new Date().toISOString() },
      { role: "assistant", content: aiResponse, timestamp: new Date().toISOString() },
    ];

    const { error: updateError } = await adminSupabase
      .from("company_insight_conversations")
      .update({ messages: updatedMessages })
      .eq("id", conversation.id);

    if (updateError) {
      log.error({ err: updateError }, "Error updating conversation");
    }

    return NextResponse.json({
      message: aiResponse,
      conversationId: conversation.id,
    });
  } catch (error) {
    log.error({ err: error }, "Chat error");
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/companies/[id]/insights/[insightId]/chat
 * Get conversation history for a company insight
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; insightId: string }> }
) {
  const paramsParsed = paramsSchema.safeParse(await params);
  if (!paramsParsed.success) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }
  const { id, insightId } = paramsParsed.data;

  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  // Verify user has access to this company
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("id", id)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // Get conversation
  const { data: conversation } = await supabase
    .from("company_insight_conversations")
    .select("*")
    .eq("company_insight_id", insightId)
    .eq("user_id", user.id)
    .single();

  if (!conversation) {
    return NextResponse.json({ messages: [] });
  }

  return NextResponse.json({
    conversationId: conversation.id,
    messages: conversation.messages || [],
  });
}
