"use client";

/**
 * SearchReportModal — generate and share a report from the current Jobs search.
 *
 * Opening the dialog immediately kicks off generation (the user already
 * expressed intent by clicking the button; a second "Generate" click would be
 * a dead step). While Gemini synthesizes, the dialog shows what it is doing.
 *
 * Once the report exists it has a permanent public URL. Title and note stay
 * editable afterwards — both "Copy link" and "Send" flush pending edits first,
 * so what the recipient reads always matches what the sender last typed.
 */

import * as React from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MAX_REPORT_JOBS,
  MAX_REPORT_RECIPIENTS,
  describeSearchContext,
  isLikelyEmail,
  parseRecipients,
  type ReportSearchContext,
  type SharedReport,
} from "@/lib/reports/types";

export interface SearchReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ids of the rows currently in view, in display order. */
  jobIds: string[];
  /** Rows the search matched, before the MAX_REPORT_JOBS cap. */
  totalMatchCount: number;
  searchContext: ReportSearchContext;
}

type Status = "idle" | "generating" | "ready" | "error";

export function SearchReportModal({
  open,
  onOpenChange,
  jobIds,
  totalMatchCount,
  searchContext,
}: SearchReportModalProps) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<SharedReport | null>(null);
  const [url, setUrl] = React.useState<string>("");

  const [title, setTitle] = React.useState("");
  const [commentary, setCommentary] = React.useState("");
  const [recipientsRaw, setRecipientsRaw] = React.useState("");

  const [copied, setCopied] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [sentCount, setSentCount] = React.useState(0);
  const [sendError, setSendError] = React.useState<string | null>(null);

  const capped = jobIds.slice(0, MAX_REPORT_JOBS);
  const recipients = parseRecipients(recipientsRaw);
  const badRecipients = recipients.filter((r) => !isLikelyEmail(r));

  // Generation runs once per opening. `generatedFor` guards against React's
  // dev-mode double effect and against a re-render re-firing the call.
  const generatedFor = React.useRef<string | null>(null);

  const reset = React.useCallback(() => {
    setStatus("idle");
    setError(null);
    setReport(null);
    setUrl("");
    setTitle("");
    setCommentary("");
    setRecipientsRaw("");
    setCopied(false);
    setSending(false);
    setSentCount(0);
    setSendError(null);
    generatedFor.current = null;
  }, []);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  React.useEffect(() => {
    if (!open || capped.length === 0) return;
    const key = capped.join(",");
    if (generatedFor.current === key) return;
    generatedFor.current = key;

    let cancelled = false;
    setStatus("generating");
    setError(null);

    (async () => {
      try {
        const res = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobIds: capped,
            totalMatchCount,
            searchContext,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Could not generate the report");
          setStatus("error");
          return;
        }
        setReport(data.report);
        setUrl(data.url);
        setTitle(data.report.title);
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setError("Could not reach the server. Try again.");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // `capped`/`searchContext` are derived fresh each render; the ref guard
    // above is what makes this fire once, so they stay out of the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Persist pending title/note edits. Returns false when the save failed. */
  const flushEdits = React.useCallback(async (): Promise<boolean> => {
    if (!report) return false;
    const nextTitle = title.trim() || report.title;
    const nextCommentary = commentary.trim() || null;
    if (nextTitle === report.title && nextCommentary === report.commentary) {
      return true;
    }
    try {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle, commentary: nextCommentary }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setReport(data.report);
      return true;
    } catch {
      return false;
    }
  }, [report, title, commentary]);

  async function handleCopy() {
    if (!url) return;
    const saved = await flushEdits();
    if (!saved) setSendError("Your note could not be saved — the link still works.");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the input below is selectable as a fallback.
    }
  }

  async function handleSend() {
    if (!report || recipients.length === 0 || badRecipients.length > 0) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/reports/${report.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients,
          title: title.trim() || report.title,
          commentary: commentary.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error || "Could not send the email");
        return;
      }
      setReport(data.report);
      setSentCount(data.sent);
      setRecipientsRaw("");
    } catch {
      setSendError("Could not reach the server. Try again.");
    } finally {
      setSending(false);
    }
  }

  const tooManyRecipients = recipients.length > MAX_REPORT_RECIPIENTS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share these results</DialogTitle>
          <DialogDescription>
            {describeSearchContext(searchContext)} · {capped.length}{" "}
            {capped.length === 1 ? "role" : "roles"}
            {totalMatchCount > capped.length
              ? ` (of ${totalMatchCount.toLocaleString()} matches)`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {capped.length === 0 && (
          <p className="rounded-lg border border-sand-200 bg-sand-25 px-4 py-3 text-[13px] text-sand-600">
            This search returned no roles. Widen the filters and try again.
          </p>
        )}

        {status === "generating" && (
          <div className="flex items-center gap-3 rounded-lg border border-sand-200 bg-sand-25 px-4 py-6">
            <Loader2 className="h-4 w-4 animate-spin text-sand-500" aria-hidden />
            <div>
              <p className="text-[13.5px] font-medium text-sand-800">
                Reading the postings
              </p>
              <p className="text-[12.5px] text-sand-600">
                Summarizing what kind of roles are in this set. Takes a few
                seconds.
              </p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="flex items-start gap-2.5 rounded-lg border border-sunset-200 bg-sunset-50 px-4 py-3">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-sunset-600"
              aria-hidden
            />
            <p className="text-[13px] text-sunset-800">{error}</p>
          </div>
        )}

        {status === "ready" && report && (
          <div className="space-y-5">
            {report.synthesis ? (
              <section className="rounded-lg border border-sand-200 bg-sand-25 px-4 py-3.5">
                <p className="mb-1.5 text-[13.5px] font-semibold leading-[1.35] text-sand-900">
                  {report.synthesis.headline}
                </p>
                <p className="text-[12.5px] leading-[1.6] text-sand-700">
                  {report.synthesis.summary}
                </p>
                {report.synthesis.roleGroups.length > 0 && (
                  <p className="mt-2.5 text-[12px] text-sand-600">
                    {report.synthesis.roleGroups
                      .map((g) => `${g.label} (${g.count})`)
                      .join(" · ")}
                  </p>
                )}
              </section>
            ) : (
              <p className="rounded-lg border border-sand-200 bg-sand-25 px-4 py-3 text-[12.5px] text-sand-600">
                The summary could not be generated this time — the report still
                lists every role.
              </p>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="report-title"
                className="text-[12.5px] font-medium text-sand-700"
              >
                Title
              </label>
              <Input
                id="report-title"
                value={title}
                maxLength={160}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="report-note"
                className="text-[12.5px] font-medium text-sand-700"
              >
                Note{" "}
                <span className="font-normal text-sand-500">
                  — shown at the top of the report and in the email
                </span>
              </label>
              <Textarea
                id="report-note"
                rows={3}
                maxLength={2000}
                placeholder="Why you're sending this…"
                value={commentary}
                onChange={(e) => setCommentary(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="report-link"
                className="text-[12.5px] font-medium text-sand-700"
              >
                Share link{" "}
                <span className="font-normal text-sand-500">
                  — readable without an account
                </span>
              </label>
              <div className="flex gap-2">
                <Input id="report-link" readOnly value={url} className="font-mono text-[12px]" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                      Copy
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  asChild
                  className="shrink-0"
                >
                  <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    Open
                  </a>
                </Button>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-sand-200 pt-4">
              <label
                htmlFor="report-recipients"
                className="text-[12.5px] font-medium text-sand-700"
              >
                Email it{" "}
                <span className="font-normal text-sand-500">
                  — comma-separated, up to {MAX_REPORT_RECIPIENTS}
                </span>
              </label>
              <div className="flex gap-2">
                <Input
                  id="report-recipients"
                  type="text"
                  placeholder="colleague@company.com"
                  value={recipientsRaw}
                  onChange={(e) => setRecipientsRaw(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSend}
                  disabled={
                    sending ||
                    recipients.length === 0 ||
                    badRecipients.length > 0 ||
                    tooManyRecipients
                  }
                  className="shrink-0"
                >
                  {sending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Mail className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Send
                </Button>
              </div>

              {badRecipients.length > 0 && (
                <p className="text-[12px] text-sunset-700">
                  Not a valid address: {badRecipients.join(", ")}
                </p>
              )}
              {tooManyRecipients && (
                <p className="text-[12px] text-sunset-700">
                  {recipients.length} addresses — the limit is{" "}
                  {MAX_REPORT_RECIPIENTS} per send.
                </p>
              )}
              {sendError && (
                <p className="text-[12px] text-sunset-700">{sendError}</p>
              )}
              {sentCount > 0 && !sendError && (
                <p className="inline-flex items-center gap-1.5 text-[12px] text-sand-600">
                  <Check className="h-3.5 w-3.5 text-growth-500" aria-hidden />
                  Sent to {sentCount}{" "}
                  {sentCount === 1 ? "recipient" : "recipients"}.
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
