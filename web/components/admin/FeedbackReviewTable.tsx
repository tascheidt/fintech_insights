"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
  Code2,
  Loader2,
  AlertTriangle,
  Link2,
  RotateCcw,
} from "lucide-react";

interface FeedbackSubmission {
  id: string;
  type: string;
  title: string;
  description: string;
  page_url: string | null;
  status: string;
  review_state: "needs_review" | "approved" | "rejected" | "shipped";
  triage_decision: string | null;
  triage_confidence: number | null;
  triage_reasoning: string | null;
  triage_mapped_priority: string | null;
  triage_duplicate_of: string | null;
  triage_suggested_title: string | null;
  triage_suggested_labels: string[] | null;
  triage_completed_at: string | null;
  triage_error: string | null;
  generated_issue: string | null;
  admin_override_decision: string | null;
  admin_notes: string | null;
  reviewed_at: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  code_gen_triggered_at: string | null;
  created_at: string;
  profiles: { email: string } | null;
}

/** Human review axis. */
const REVIEW_STYLES: Record<string, string> = {
  needs_review: "bg-highlight-soft text-highlight-soft-foreground",
  approved: "bg-primary-soft text-primary-soft-foreground",
  rejected: "bg-muted text-muted-foreground",
  shipped: "bg-growth-500/10 text-growth-500",
};

const REVIEW_LABELS: Record<string, string> = {
  needs_review: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
  shipped: "Shipped",
};

/** AI verdict axis — shown alongside, never instead of, the review state. */
const DECISION_STYLES: Record<string, string> = {
  yes: "bg-growth-500/10 text-growth-500",
  maybe: "bg-primary-soft text-primary-soft-foreground",
  no: "bg-destructive/10 text-destructive",
};

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "needs_review", label: "Needs review" },
  { value: "approved", label: "Approved" },
  { value: "shipped", label: "Shipped" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

const PAGE_SIZE = 50;

export function FeedbackReviewTable() {
  const [items, setItems] = useState<FeedbackSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  // Defaults to the queue that needs a human, not to everything. Under the old
  // status model an AI-accepted row and a shipped one both read "accepted", so
  // five submissions sat unactioned for months with nothing surfacing them.
  const [filter, setFilter] = useState("needs_review");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [codeGenLoading, setCodeGenLoading] = useState<string | null>(null);
  const [retriageLoading, setRetriageLoading] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // A failed list fetch used to be swallowed, leaving the table rendering the
  // "No feedback in this view" empty state. When the deployed schema lagged the
  // code the GET 500'd on a missing column and the queue read as *empty* rather
  // than broken, which is a far more expensive failure than an ugly error.
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchFeedback = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      if (filter !== "all") params.set("review_state", filter);

      const res = await fetch(`/api/admin/feedback?${params}`);
      if (!res.ok) {
        const detail = await res
          .json()
          .then((body) => (typeof body?.error === "string" ? body.error : null))
          .catch(() => null);
        setFetchError(detail || `Request failed (${res.status})`);
        setItems([]);
        setTotal(0);
        setHasMore(false);
        return;
      }

      const data = await res.json();
      setFetchError(null);
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setHasMore(Boolean(data.has_more));
    } catch {
      setFetchError("Could not reach the feedback API.");
      setItems([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    setLoading(true);
    fetchFeedback();
  }, [fetchFeedback]);

  function setError(id: string, message: string | null) {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }

  /** Titles for duplicate links currently on screen. */
  const titleById = new Map(items.map((i) => [i.id, i.title]));

  async function setReviewState(
    id: string,
    reviewState: "needs_review" | "approved" | "rejected"
  ) {
    setActionLoading(id);
    setError(id, null);
    try {
      const body: Record<string, string> = { id, review_state: reviewState };
      if (adminNotes[id]) body.admin_notes = adminNotes[id];

      const res = await fetch("/api/admin/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(id, json.error ?? `Update failed (${res.status})`);
        return;
      }
      await fetchFeedback();
    } finally {
      setActionLoading(null);
    }
  }

  async function copyIssueMarkdown(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleCreateIssue(id: string) {
    setActionLoading(id);
    setError(id, null);
    try {
      const res = await fetch(`/api/admin/feedback/${id}/issue`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      // Failures are real status codes now — the old handler returned 200 with
      // a `github_error` field, which one client path read and the other didn't.
      if (!res.ok) {
        setError(id, json.error ?? `Issue creation failed (${res.status})`);
        return;
      }
      await fetchFeedback();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleGenerateCode(id: string, force = false) {
    setCodeGenLoading(id);
    setError(id, null);
    try {
      const res = await fetch(
        `/api/admin/feedback/${id}/generate-code${force ? "?force=true" : ""}`,
        { method: "POST" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(id, json.hint ? `${json.error} — ${json.hint}` : json.error);
        return;
      }
      await fetchFeedback();
    } finally {
      setCodeGenLoading(null);
    }
  }

  /**
   * Re-run AI triage. A failed triage used to be terminal from here — the row
   * showed its error and offered nothing to do about it, so recovering needed
   * shell access and a .env.local.
   */
  async function handleRetriage(id: string) {
    setRetriageLoading(id);
    setError(id, null);
    try {
      const res = await fetch(`/api/admin/feedback/${id}/retriage`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(id, json.error ?? `Triage failed (${res.status})`);
      }
      // Refresh either way: on failure the engine has persisted a fresh
      // triage_error, which is more useful than the one already on screen.
      await fetchFeedback();
    } finally {
      setRetriageLoading(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-semibold">Feedback Submissions</h3>
            <CardDescription>
              Review and triage user feedback
              {total > 0 && ` — ${total} in this view`}
            </CardDescription>
          </div>
          <div className="flex gap-1 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => {
                  setFilter(f.value);
                  setPage(0);
                }}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  filter === f.value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : fetchError ? (
          <div className="py-8 flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Couldn&apos;t load feedback</p>
              <p className="text-xs text-muted-foreground max-w-md break-words">
                {fetchError}
              </p>
            </div>
            <button
              onClick={() => {
                setLoading(true);
                fetchFeedback();
              }}
              className="text-xs px-2.5 py-1 rounded border hover:bg-muted transition-colors"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No feedback in this view
          </p>
        ) : (
          <div className="divide-y">
            {items.map((item) => {
              const isExpanded = expandedId === item.id;
              const duplicateTitle = item.triage_duplicate_of
                ? titleById.get(item.triage_duplicate_of)
                : null;

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
                          REVIEW_STYLES[item.review_state] ?? REVIEW_STYLES.needs_review
                        }`}
                      >
                        {REVIEW_LABELS[item.review_state] ?? item.review_state}
                      </span>
                      {item.triage_decision && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs shrink-0 ${
                            DECISION_STYLES[item.triage_decision] || ""
                          }`}
                          title="AI verdict"
                        >
                          AI: {item.triage_decision}
                          {item.triage_confidence ? ` (${item.triage_confidence}/10)` : ""}
                        </span>
                      )}
                      {item.triage_error && (
                        <span
                          className="shrink-0 text-destructive"
                          title="Triage failed — see details"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
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
                          <p className="text-xs text-muted-foreground">
                            Page: {item.page_url}
                          </p>
                        )}
                      </div>

                      {item.triage_error ? (
                        <div className="space-y-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
                          <p className="text-xs font-medium text-destructive uppercase tracking-wide">
                            Triage failed
                          </p>
                          <p className="text-xs text-destructive font-mono break-all">
                            {item.triage_error}
                          </p>
                          <RetriageButton
                            id={item.id}
                            loading={retriageLoading === item.id}
                            onClick={handleRetriage}
                          />
                        </div>
                      ) : (
                        !item.triage_completed_at && (
                          <div className="space-y-2 rounded-md border bg-muted/40 p-3">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Not yet triaged
                            </p>
                            <RetriageButton
                              id={item.id}
                              loading={retriageLoading === item.id}
                              onClick={handleRetriage}
                            />
                          </div>
                        )
                      )}

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
                            <button
                              onClick={() => {
                                setFilter("all");
                                setPage(0);
                                setExpandedId(item.triage_duplicate_of);
                              }}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <Link2 className="h-3 w-3" />
                              Possible duplicate of{" "}
                              {duplicateTitle ?? item.triage_duplicate_of}
                            </button>
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
                                  className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-md font-medium text-primary hover:bg-primary-soft transition-colors"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Issue #{item.github_issue_number}
                                </a>
                              ) : null}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() =>
                                  copyIssueMarkdown(item.generated_issue!, item.id)
                                }
                              >
                                {copiedId === item.id ? (
                                  <>
                                    <Check className="h-3 w-3" /> Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" /> Copy
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                          <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                            {item.generated_issue}
                          </pre>
                        </div>
                      )}

                      {errors[item.id] && (
                        <p className="text-xs text-destructive">{errors[item.id]}</p>
                      )}

                      {/*
                        Actions are available in EVERY state. The previous
                        version hid this whole block once status was 'accepted'
                        or 'declined' — both of which the AI wrote directly — so
                        an AI verdict was final and two genuine bug reports were
                        unreachable without SQL.
                      */}
                      <div className="space-y-2 pt-2 border-t">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Admin Actions
                        </p>
                        <Textarea
                          placeholder="Add notes (optional)"
                          value={adminNotes[item.id] ?? item.admin_notes ?? ""}
                          onChange={(e) =>
                            setAdminNotes((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          className="min-h-[60px] text-sm"
                        />
                        <div className="flex gap-2 flex-wrap">
                          {item.review_state !== "approved" && (
                            <Button
                              size="sm"
                              onClick={() => setReviewState(item.id, "approved")}
                              disabled={actionLoading === item.id}
                            >
                              Approve
                            </Button>
                          )}
                          {item.review_state !== "rejected" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setReviewState(item.id, "rejected")}
                              disabled={actionLoading === item.id}
                            >
                              Reject
                            </Button>
                          )}
                          {item.review_state !== "needs_review" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setReviewState(item.id, "needs_review")}
                              disabled={actionLoading === item.id}
                              title="Return this submission to the review queue"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Reopen
                            </Button>
                          )}

                          {item.review_state === "approved" &&
                            !item.github_issue_number && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  actionLoading === item.id || !item.generated_issue
                                }
                                onClick={() => handleCreateIssue(item.id)}
                                title={
                                  item.generated_issue
                                    ? undefined
                                    : "No generated issue — run triage first"
                                }
                              >
                                {actionLoading === item.id ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" /> Creating...
                                  </>
                                ) : (
                                  <>
                                    <ExternalLink className="h-3 w-3" /> Create GitHub Issue
                                  </>
                                )}
                              </Button>
                            )}

                          {item.github_issue_number && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={codeGenLoading === item.id}
                              onClick={() =>
                                handleGenerateCode(item.id, !!item.code_gen_triggered_at)
                              }
                            >
                              {codeGenLoading === item.id ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" /> Triggering...
                                </>
                              ) : item.code_gen_triggered_at ? (
                                <>
                                  <RotateCcw className="h-3 w-3" /> Re-run code gen
                                </>
                              ) : (
                                <>
                                  <Code2 className="h-3 w-3" /> Generate Code
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                        {item.code_gen_triggered_at && (
                          <p className="text-xs text-muted-foreground">
                            Code generation triggered{" "}
                            {new Date(item.code_gen_triggered_at).toLocaleString()}
                          </p>
                        )}
                      </div>

                      {item.reviewed_at && (
                        <div className="text-xs text-muted-foreground pt-2 border-t">
                          Last reviewed {new Date(item.reviewed_at).toLocaleDateString()}
                          {item.admin_notes && <> — {item.admin_notes}</>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {(page > 0 || hasMore) && (
          <div className="flex items-center justify-between pt-4 mt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              disabled={page === 0 || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasMore || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Re-run triage. Rendered both when a triage attempt failed and when one never
 * completed — the second case is what a stuck 'reviewing' row looks like after
 * the engine set triage_attempted_at and then threw.
 */
function RetriageButton({
  id,
  loading,
  onClick,
}: {
  id: string;
  loading: boolean;
  onClick: (id: string) => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={loading}
      onClick={() => onClick(id)}
      className="h-7 text-xs"
    >
      {loading ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Re-running triage...
        </>
      ) : (
        <>
          <RotateCcw className="h-3 w-3" />
          Re-run triage
        </>
      )}
    </Button>
  );
}
