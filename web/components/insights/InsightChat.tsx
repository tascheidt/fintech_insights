"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Send, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

interface InsightChatProps {
  insightId: string;
}

const SUGGESTED_QUESTIONS = [
  "What makes this role novel compared to their typical hires?",
  "How does this relate to recent company news?",
  "What strategic implications does this have?",
  "Is this a significant executive movement?",
];

export function InsightChat({ insightId }: InsightChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load conversation history on mount
  useEffect(() => {
    loadConversation();
  }, [insightId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  async function loadConversation() {
    try {
      const response = await fetch(`/api/insights/${insightId}/chat`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error("Error loading conversation:", error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading || isStreaming) return;

    const userMessage: Message = {
      role: "user",
      parts: [{ text: input.trim() }],
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setIsStreaming(true);
    setStreamingText("");

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`/api/insights/${insightId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: input.trim() }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              // Finalize the message
              if (accumulatedText) {
                const modelMessage: Message = {
                  role: "model",
                  parts: [{ text: accumulatedText }],
                };
                setMessages((prev) => [...prev, modelMessage]);
                setStreamingText("");
              }
              setIsStreaming(false);
              setIsLoading(false);
              return;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                accumulatedText += parsed.text;
                setStreamingText(accumulatedText);
              }
            } catch (e) {
              // Ignore JSON parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("Request aborted");
      } else {
        console.error("Error sending message:", error);
        setMessages((prev) => [
          ...prev,
          {
            role: "model",
            parts: [{ text: "Sorry, I encountered an error. Please try again." }],
          },
        ]);
      }
      setIsStreaming(false);
      setIsLoading(false);
      setStreamingText("");
    }
  }

  function handleSuggestedQuestion(question: string) {
    setInput(question);
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold">Ask Follow-up Questions</h3>
        <p className="text-sm text-muted-foreground">
          Get deeper insights about this strategic analysis
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Messages */}
        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
          {messages.length === 0 && !isStreaming && (
            <div className="text-sm text-muted-foreground py-4">
              <p className="mb-2">Suggested questions:</p>
              <ul className="space-y-1 list-disc list-inside">
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => handleSuggestedQuestion(q)}
                      className="text-left hover:text-foreground underline"
                    >
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <div className="text-sm whitespace-pre-wrap">
                  {msg.parts[0]?.text || ""}
                </div>
              </div>
            </div>
          ))}

          {isStreaming && streamingText && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
                <div className="text-sm whitespace-pre-wrap">
                  {streamingText}
                  <span className="animate-pulse">▋</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about this insight..."
            disabled={isLoading || isStreaming}
            className="flex-1"
          />
          <Button
            type="submit"
            disabled={!input.trim() || isLoading || isStreaming}
            size="icon"
          >
            {isLoading || isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
