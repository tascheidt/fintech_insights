import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildHistoricalContext, formatHistoricalContextForPrompt } from "@/lib/analysis/context-builder";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/insights/[id]/chat
 * Conversational follow-up on strategic insights using Gemini 3 Pro
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { question } = await req.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const adminSupabase = createAdminClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Load insight with full context
    const { data: insight, error: insightError } = await adminSupabase
      .from("strategic_insights")
      .select(`
        *,
        job_postings!job_posting_id(
          id,
          title,
          department,
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

    const job = (insight as any).job_postings;
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
    let previousMessages: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (existingConv) {
      conversationId = existingConv.id;
      previousMessages = (existingConv.messages as any) || [];
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

    const systemPrompt = `You are an expert competitive intelligence analyst helping a user understand strategic insights from job postings.

## Current Insight Context
Company: ${company.name}
Job Title: ${job.title}
Department: ${job.department || "Not specified"}
Location: ${job.location || "Not specified"}

Original Insight Summary: ${(insight as any).insight_summary || "N/A"}
Category: ${(insight as any).category || "N/A"}
Novelty Score: ${(insight as any).novelty_score || "N/A"}/10
Strategic Hypothesis: ${(insight as any).strategic_hypothesis || "N/A"}
${(insight as any).is_executive_movement ? `Executive Movement: ${(insight as any).executive_context || "Yes"}` : ""}

## Company Historical Context
${historicalText}

## Job Description
${job.description_text || "No description available"}

Your role is to answer follow-up questions about this insight, provide deeper analysis, and help the user understand the strategic implications. Use web search when needed to get the latest information about the company.`;

    // Initialize Gemini with fallback (pro -> flash)
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(key);
    
    // Try pro model first, fallback to flash if quota exceeded
    let model = genAI.getGenerativeModel({
      model: "gemini-3-pro-preview",
      // @ts-expect-error - googleSearch tool exists at runtime but types may be outdated
      tools: [{ googleSearch: {} }],
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    });

    // Build conversation history
    const history = previousMessages.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: msg.parts,
    }));

    // Start chat with history
    let chat = model.startChat({
      history: history as any,
    });

    // Stream the response with error handling
    let stream;
    try {
      stream = await chat.sendMessageStream(question);
    } catch (error: any) {
      // If we get a quota error during generation, try flash model as fallback
      if (error?.status === 429 || error?.message?.includes("quota") || error?.message?.includes("limit") || error?.message?.includes("exceeded")) {
        console.warn(`gemini-3-pro-preview quota exceeded: ${error.message}. Falling back to gemini-3-flash-preview.`);
        model = genAI.getGenerativeModel({
          model: "gemini-3-flash-preview",
          systemInstruction: systemPrompt,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        });
        chat = model.startChat({
          history: history as any,
        });
        stream = await chat.sendMessageStream(question);
      } else {
        throw error;
      }
    }

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
          console.error("Streaming error:", error);
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
    console.error("Chat API error:", error);
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
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    console.error("Get conversation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
