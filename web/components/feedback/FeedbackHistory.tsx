"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";

interface FeedbackItem {
  id: string;
  type: string;
  title: string;
  review_state: "needs_review" | "approved" | "rejected" | "shipped";
  admin_notes: string | null;
  github_issue_url: string | null;
  created_at: string;
}

/**
 * Status copy shown to the person who submitted the feedback.
 *
 * This surface deliberately does NOT render `triage_reasoning`. That field is
 * internal classification output written for an admin audience, and when triage
 * failed the old engine wrote raw Gemini error strings into it — which this
 * component displayed verbatim to the submitter. The API no longer returns it.
 *
 * The labels below are product copy, not model output, which is also what keeps
 * this surface consistent with the editorial voice rules without putting a voice
 * directive on an internal classification prompt.
 */
const STATE_STYLES: Record<string, string> = {
  needs_review: "bg-muted text-muted-foreground",
  approved: "bg-primary-soft text-primary-soft-foreground",
  rejected: "bg-muted text-muted-foreground",
  shipped: "bg-growth-500/10 text-growth-500",
};

const STATE_LABELS: Record<string, string> = {
  needs_review: "With the team",
  approved: "Planned",
  rejected: "Not planned",
  shipped: "In progress",
};

const STATE_BLURB: Record<string, string> = {
  needs_review: "We've got this and someone will look at it.",
  approved: "We're planning to do this.",
  rejected: "We're not taking this one forward for now.",
  shipped: "Work has started on this.",
};

const TYPE_LABELS: Record<string, string> = {
  feature: "Feature",
  bug: "Bug",
  improvement: "Improvement",
  general: "General",
};

export function FeedbackHistory() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFeedback() {
      try {
        const res = await fetch("/api/feedback");
        if (res.ok) {
          const data = await res.json();
          setItems(data);
        }
      } catch {
        // Silently fail — non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchFeedback();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <h2 className="font-semibold">My Feedback</h2>
          <CardDescription>Your submitted feedback and its status</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">My Feedback</h2>
        <CardDescription>Your submitted feedback and its status</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No feedback submitted yet
          </p>
        ) : (
          <div className="divide-y">
            {items.map((item) => (
              <div key={item.id} className="py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                      {TYPE_LABELS[item.type] || item.type}
                    </span>
                    <p className="font-medium text-sm truncate">{item.title}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                      STATE_STYLES[item.review_state] || STATE_STYLES.needs_review
                    }`}
                  >
                    {STATE_LABELS[item.review_state] || "With the team"}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground pl-0.5">
                  {item.admin_notes || STATE_BLURB[item.review_state] || ""}
                </p>

                <div className="flex items-center gap-3">
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  {item.github_issue_url && (
                    <a
                      href={item.github_issue_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Track progress
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
