"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

interface CompanyInsightChatProps {
  companyId: string;
  insightId: string;
  companyName: string;
}

export function CompanyInsightChat({
  companyId,
  insightId,
  companyName,
}: CompanyInsightChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load existing conversation
  useEffect(() => {
    async function loadConversation() {
      try {
        const res = await fetch(
          `/api/companies/${companyId}/insights/${insightId}/chat`
        );
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch (err) {
        console.error("Failed to load conversation:", err);
      } finally {
        setInitialLoading(false);
      }
    }
    loadConversation();
  }, [companyId, insightId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch(
        `/api/companies/${companyId}/insights/${insightId}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userMessage }),
        }
      );

      if (!res.ok) {
        throw new Error("Failed to send message");
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const suggestedQuestions = [
    `What does ${companyName}'s hiring suggest about their product roadmap?`,
    "Are there any concerning discrepancies I should watch?",
    "How does this compare to competitors?",
    "What skills are they prioritizing?",
  ];

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Ask About This Insight</h2>
        <p className="text-sm text-muted-foreground">
          Ask questions to explore the analysis in more depth
        </p>
      </CardHeader>
      <CardContent>
        {/* Messages */}
        <div className="h-80 overflow-y-auto border rounded-lg p-4 mb-4 space-y-4 bg-muted/30">
          {initialLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Loading conversation...
            </div>
          ) : messages.length === 0 ? (
            <div className="space-y-4">
              <p className="text-center text-muted-foreground text-sm">
                Start a conversation about this insight
              </p>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">
                  Suggested questions:
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {suggestedQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(q)}
                      className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-left"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
                <p className="text-sm text-muted-foreground">Thinking...</p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about this insight..."
            disabled={loading}
            className="flex-1"
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
