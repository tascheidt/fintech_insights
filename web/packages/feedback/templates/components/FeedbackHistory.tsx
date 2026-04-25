/**
 * TEMPLATE: Feedback History
 *
 * Copy this file into your app and customize:
 * - UI imports: Replace @/components/ui/* with your app's component library
 * - API_PATH: Must match your feedbackConfig.apiBasePath
 */
"use client";

import { useEffect, useState } from "react";

// TODO: Replace with your app's UI components
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";

// TODO: Must match your feedbackConfig.apiBasePath
const API_PATH = "/api/feedback";

interface FeedbackItem {
  id: string;
  type: string;
  title: string;
  status: string;
  triage_decision: string | null;
  triage_reasoning: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  submitted: "bg-gray-500/10 text-gray-600",
  reviewing: "bg-yellow-500/10 text-yellow-600",
  accepted: "bg-green-500/10 text-green-600",
  maybe: "bg-blue-500/10 text-blue-600",
  declined: "bg-red-500/10 text-red-600",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  reviewing: "Under review",
  accepted: "Accepted",
  maybe: "Under consideration",
  declined: "Not planned",
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
        const res = await fetch(API_PATH);
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
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                      {TYPE_LABELS[item.type] || item.type}
                    </span>
                    <p className="font-medium text-sm truncate">{item.title}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                      STATUS_STYLES[item.status] || STATUS_STYLES.submitted
                    }`}
                  >
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                </div>
                {item.triage_reasoning && (
                  <p className="text-xs text-muted-foreground pl-0.5">
                    {item.triage_reasoning}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {new Date(item.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
