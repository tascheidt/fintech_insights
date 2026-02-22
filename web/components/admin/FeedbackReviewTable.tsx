"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronRight, Copy, Check, ExternalLink, Code2, Loader2 } from "lucide-react";

interface FeedbackSubmission {
  id: string;
  type: string;
  title: string;
  description: string;
  page_url: string | null;
  status: string;
  triage_decision: string | null;
  triage_confidence: number | null;
  triage_reasoning: string | null;
  triage_mapped_priority: string | null;
  triage_duplicate_of: string | null;
  triage_suggested_title: string | null;
  triage_suggested_labels: string[] | null;
  triage_completed_at: string | null;
  generated_issue: string | null;
  admin_override_decision: string | null;
  admin_notes: string | null;
  reviewed_at: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  created_at: string;
  profiles: { email: string } | null;
}

const STATUS_STYLES: Record<string, string> = {
  submitted: "bg-gray-500/10 text-gray-600",
  reviewing: "bg-yellow-500/10 text-yellow-600",
  accepted: "bg-green-500/10 text-green-600",
  maybe: "bg-blue-500/10 text-blue-600",
  declined: "bg-red-500/10 text-red-600",
};

const DECISION_STYLES: Record<string, string> = {
  yes: "bg-green-500/10 text-green-600",
  maybe: "bg-blue-500/10 text-blue-600",
  no: "bg-red-500/10 text-red-600",
};

const STATUS_FILTERS = ["all", "submitted", "reviewing", "maybe", "accepted", "declined"];

export function FeedbackReviewTable() {
  const [items, setItems] = useState<FeedbackSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [codeGenLoading, setCodeGenLoading] = useState<string | null>(null);
  const [codeGenTriggered, setCodeGenTriggered] = useState<Set<string>>(new Set());

  const fetchFeedback = useCallback(async () => {
    try {
      const url = filter === "all" ? "/api/admin/feedback" : `/api/admin/feedback?status=${filter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchFeedback();
  }, [fetchFeedback]);

  async function handleAction(id: string, decision: "accepted" | "declined") {
    setActionLoading(id);
    try {
      const body: Record<string, string> = { id, admin_override_decision: decision };
      if (adminNotes[id]) body.admin_notes = adminNotes[id];

      const res = await fetch("/api/admin/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        await fetchFeedback();
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function copyIssueMarkdown(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleGenerateCode(id: string) {
    setCodeGenLoading(id);
    try {
      const res = await fetch(`/api/admin/feedback/${id}/generate-code`, { method: "POST" });
      if (res.ok) {
        setCodeGenTriggered((prev) => new Set(prev).add(id));
      }
    } finally {
      setCodeGenLoading(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Feedback Submissions</h3>
            <CardDescription>Review and triage user feedback</CardDescription>
          </div>
          <div className="flex gap-1">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  filter === s
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No feedback found</p>
        ) : (
          <div className="divide-y">
            {items.map((item) => {
              const isExpanded = expandedId === item.id;
              return (
                <div key={item.id} className="py-3">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="w-full text-left flex items-center gap-3"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                          STATUS_STYLES[item.status] || STATUS_STYLES.submitted
                        }`}
                      >
                        {item.status}
                      </span>
                      {item.triage_decision && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs shrink-0 ${
                            DECISION_STYLES[item.triage_decision] || ""
                          }`}
                        >
                          {item.triage_decision}
                          {item.triage_confidence ? ` (${item.triage_confidence}/10)` : ""}
                        </span>
                      )}
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                        {item.type}
                      </span>
                      <p className="text-sm font-medium truncate">{item.title}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {item.profiles?.email?.split("@")[0] || "unknown"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 ml-7 space-y-3">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Description
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{item.description}</p>
                        {item.page_url && (
                          <p className="text-xs text-muted-foreground">Page: {item.page_url}</p>
                        )}
                      </div>

                      {item.triage_reasoning && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            AI Assessment
                          </p>
                          <p className="text-sm">{item.triage_reasoning}</p>
                          {item.triage_mapped_priority && (
                            <p className="text-xs text-muted-foreground">
                              Mapped to: {item.triage_mapped_priority}
                            </p>
                          )}
                          {item.triage_duplicate_of && (
                            <p className="text-xs text-yellow-600">
                              Possible duplicate: {item.triage_duplicate_of}
                            </p>
                          )}
                        </div>
                      )}

                      {item.generated_issue && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Generated Issue
                            </p>
                            <div className="flex items-center gap-1">
                              {item.github_issue_url ? (
                                <a
                                  href={item.github_issue_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-md font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Issue #{item.github_issue_number}
                                </a>
                              ) : null}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => copyIssueMarkdown(item.generated_issue!, item.id)}
                              >
                                {copiedId === item.id ? (
                                  <><Check className="h-3 w-3" /> Copied</>
                                ) : (
                                  <><Copy className="h-3 w-3" /> Copy</>
                                )}
                              </Button>
                            </div>
                          </div>
                          <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                            {item.generated_issue}
                          </pre>
                        </div>
                      )}

                      {item.status === "accepted" && item.github_issue_number && (
                        <div className="pt-2 border-t">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={codeGenLoading === item.id || codeGenTriggered.has(item.id)}
                            onClick={() => handleGenerateCode(item.id)}
                            className="text-xs h-7"
                          >
                            {codeGenLoading === item.id ? (
                              <><Loader2 className="h-3 w-3 animate-spin" /> Triggering...</>
                            ) : codeGenTriggered.has(item.id) ? (
                              <><Check className="h-3 w-3" /> Code generation triggered</>
                            ) : (
                              <><Code2 className="h-3 w-3" /> Generate Code</>
                            )}
                          </Button>
                        </div>
                      )}

                      {(item.status === "maybe" || item.status === "reviewing") && !item.admin_override_decision && (
                        <div className="space-y-2 pt-2 border-t">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Admin Actions
                          </p>
                          <Textarea
                            placeholder="Add notes (optional)"
                            value={adminNotes[item.id] || ""}
                            onChange={(e) =>
                              setAdminNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            className="min-h-[60px] text-sm"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleAction(item.id, "accepted")}
                              disabled={actionLoading === item.id}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction(item.id, "declined")}
                              disabled={actionLoading === item.id}
                            >
                              Decline
                            </Button>
                          </div>
                        </div>
                      )}

                      {item.admin_override_decision && (
                        <div className="text-xs text-muted-foreground pt-2 border-t">
                          Admin decision: <span className="font-medium">{item.admin_override_decision}</span>
                          {item.admin_notes && <> — {item.admin_notes}</>}
                          {item.reviewed_at && (
                            <> on {new Date(item.reviewed_at).toLocaleDateString()}</>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
