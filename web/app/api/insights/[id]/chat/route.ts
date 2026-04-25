import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildHistoricalContext, formatHistoricalContextForPrompt } from "@/lib/analysis/context-builder";
import { getVoiceDirective } from "@/lib/ai/voice";
import { recordUsage } from "@/lib/ai/gemini-meter";
import { writeUsageEvent } from "@/lib/ai/gemini-telemetry";
import { requireUser } from "@/lib/auth/guards";
import { log } from "@/lib/log";
import { z } from "zod";

const chatSchema = z.object({
  question: z.string().min(1).max(2000),
});

const paramsSchema = z.object({ id: z.string().uuid() });

interface ChatMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

interface InsightWithJob {
  id: string;
  insight_summary: string | null;
  category: string | null;
  novelty_score: number | null;
  strategic_hypothesis: string | null;
  is_executive_movement: boolean | null;
  executive_context: string | null;
  job_postings: {
    id: string;
    title: string;
    standardized_department: string | null;
    location: string | null;
    description_text: string | null;
    companies: { id: string; name: string };
  } | null;
}

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/insights/[id]/chat
 * Conversational follow-up on strategic insights using Gemini Pro
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const paramsParsed = paramsSchema.safeParse(await params);
    if (!paramsParsed.success) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const { id } = paramsParsed.data;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = chatSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
    }
    const { question } = parsed.data;

    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;
    const adminSupabase = createAdminClient();

    // Load insight with full context
    const { data: insight, error: insightError } = await adminSupabase
      .from("strategic_insights")
      .select(`
        *,
        job_postings!job_posting_id(
          id,
          title,
          standardized_department,
          location,
          description_text,
          companies(id, name)
        )
      `)
      .eq("id", id)
      .single();

    if (insightError || !insight) {
      return NextResponse.json({ error: "Insight not found" }, { status: 404 });
    }

    const insightTyped = insight as unknown as InsightWithJob & Record<string, unknown>;
    const job = insightTyped.job_postings;
    const company = job?.companies;

    if (!job || !company) {
      return NextResponse.json({ error: "Job or company not found" }, { status: 404 });
    }

    // Load or create conversation
    const { data: existingConv } = await adminSupabase
      .from("insight_conversations")
      .select("*")
      .eq("insight_id", id)
      .eq("user_id", user.id)
      .single();

    let conversationId: string;
    let previousMessages: ChatMessage[] = [];

    if (existingConv) {
      conversationId = existingConv.id;
      previousMessages = (existingConv.messages as ChatMessage[] | null) ?? [];
    } else {
      const { data: newConv } = await adminSupabase
        .from("insight_conversations")
        .insert({
          insight_id: id,
          user_id: user.id,
          messages: [],
        })
        .select()
        .single();
      conversationId = newConv!.id;
    }

    // Build system prompt with full context
    const historicalContext = await buildHistoricalContext(company.id, 90);
    const historicalText = formatHistoricalContextForPrompt(historicalContext);

    const systemPrompt = `${getVoiceDirective("chat")}

You are an expert competitive intelligence analyst helping a user understand strategic insights from job postings.

## Current Insight Context
Company: ${company.name}
Job Title: ${job.title}
Department: ${job.standardized_department || "Not specified"}
Location: ${job.location || "Not specified"}

Original Insight Summary: ${insightTyped.insight_summary || "N/A"}
Category: ${insightTyped.category || "N/A"}
Novelty Score: ${insightTyped.novelty_score || "N/A"}/10
Strategic Hypothesis: ${insightTyped.strategic_hypothesis || "N/A"}
${insightTyped.is_executive_movement ? `Executive Movement: ${insightTyped.executive_context || "Yes"}` : ""}

## Company Historical Context
${historicalText}

## Job Description
${job.description_text || "No description available"}

Your role is to answer follow-up questions about this insight, provide deeper analysis, and help the user understand the strategic implications. Use web search when needed to get the latest information about the company.`;

    // Initialize Gemini — use Flash for cost efficiency (supports Google Search grounding)
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(key);

    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      // @ts-expect-error - googleSearch tool exists at runtime but types may be outdated
      tools: [{ googleSearch: {} }],
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 16384,
      },
    });

    // Build conversation history
    const history = previousMessages.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: msg.parts,
    }));

    // Start chat with history
    const chat = model.startChat({
      history,
    });

    // Stream the response
    const _chatStartMs = Date.now();
    const stream = await chat.sendMessageStream(question);

    // Create a readable stream for the response
    const encoder = new TextEncoder();
    let fullResponseText = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream.stream) {
            const text = chunk.text();
            if (text) {
              fullResponseText += text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }

          // After the stream drains, `stream.response` resolves with the final
          // aggregated response including usageMetadata.
          try {
            const aggregated = await stream.response;
            writeUsageEvent(
              recordUsage({
                callSite: "insightChat",
                modelRequested: "gemini-flash-latest",
                groundingEnabled: true,
                usageMetadata: aggregated.usageMetadata,
                latencyMs: Date.now() - _chatStartMs,
                status: "ok",
                extra: { insightId: id, streamed: true },
              })
            );
          } catch (meterErr) {
            log.error({ err: meterErr }, "[gemini-telemetry] insightChat usage read failed");
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();

          // Save conversation after streaming completes
          const updatedMessages = [
            ...previousMessages,
            { role: "user", parts: [{ text: question }] },
            { role: "model", parts: [{ text: fullResponseText }] },
          ];

          await adminSupabase
            .from("insight_conversations")
            .update({
              messages: updatedMessages,
              updated_at: new Date().toISOString(),
            })
            .eq("id", conversationId);
        } catch (error) {
          log.error({ err: error }, "Streaming error");
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    log.error({ err: error }, "Chat API error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/insights/[id]/chat
 * Get conversation history for an insight
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const paramsParsed = paramsSchema.safeParse(await params);
    if (!paramsParsed.success) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const { id } = paramsParsed.data;

    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const { user, supabase } = auth;

    const { data: conversation } = await supabase
      .from("insight_conversations")
      .select("*")
      .eq("insight_id", id)
      .eq("user_id", user.id)
      .single();

    if (!conversation) {
      return NextResponse.json({ messages: [] });
    }

    return NextResponse.json({
      messages: conversation.messages || [],
      conversationId: conversation.id,
    });
  } catch (error) {
    log.error({ err: error }, "Get conversation error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
