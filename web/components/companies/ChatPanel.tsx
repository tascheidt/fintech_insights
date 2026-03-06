"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, X, Send } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  companyId: string;
  insightId: string;
  companyName: string;
}

export function ChatPanel({ companyId, insightId, companyName }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFetched = useRef(false);

  // Load existing conversation once on first open
  useEffect(() => {
    if (!isOpen || hasFetched.current) return;
    hasFetched.current = true;
    setInitialLoading(true);
    fetch(`/api/companies/${companyId}/insights/${insightId}/chat`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.messages?.length) setMessages(data.messages);
      })
      .catch(() => {})
      .finally(() => setInitialLoading(false));
  }, [isOpen, companyId, insightId]);

  // Auto-focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
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
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message },
      ]);
    } catch {
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
    `What does this suggest about ${companyName}'s product roadmap?`,
    "Are there any concerning discrepancies I should watch?",
    "What skills are they prioritizing right now?",
  ];

  const unreadCount = messages.filter((m) => m.role === "assistant").length;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        aria-label={isOpen ? "Close chat" : "Ask about this analysis"}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-lg transition-opacity hover:opacity-90"
      >
        {isOpen ? (
          <X className="h-4 w-4" />
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Ask
            {unreadCount > 0 && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background text-[10px] font-bold text-foreground">
                {unreadCount}
              </span>
            )}
          </>
        )}
      </button>

      {/* Slide-up panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50 flex w-[calc(100vw-3rem)] max-w-[380px] flex-col rounded-xl border bg-background shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Ask about this analysis</p>
              <p className="text-xs text-muted-foreground">{companyName}</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4" style={{ maxHeight: "380px" }}>
            {initialLoading ? (
              <p className="text-center text-sm text-muted-foreground">
                Loading conversation...
              </p>
            ) : messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-center text-xs text-muted-foreground">
                  Ask anything about this company&apos;s hiring patterns
                </p>
                <div className="space-y-1.5">
                  {suggestedQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(q)}
                      className="w-full rounded-lg bg-muted px-3 py-2 text-left text-xs transition-colors hover:bg-muted/70"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-foreground text-background"
                          : "bg-muted"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                      Thinking...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t p-3">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question..."
                disabled={loading}
                className="flex-1 text-sm"
              />
              <Button
                type="submit"
                size="icon"
                disabled={loading || !input.trim()}
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
