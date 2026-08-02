"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FEEDBACK_TYPES = [
  { value: "feature", label: "Feature request" },
  { value: "bug", label: "Bug report" },
  { value: "improvement", label: "Improvement" },
  { value: "general", label: "General" },
] as const;

const TITLE_PLACEHOLDERS: Record<string, string> = {
  feature: "What new capability would help you most?",
  bug: "Describe what happened and what you expected.",
  improvement: "What could work better?",
  general: "What\u2019s on your mind?",
};

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Optional preset for callers that open this dialog for a specific purpose.
   * `RequestCompanyButton` promises "Request a Company" and then opened a
   * generic "Send us your thoughts" form defaulted to `feature`, leaving the
   * user to guess what to type — and triage to guess what they meant.
   */
  preset?: {
    type?: string;
    heading?: string;
    subheading?: string;
    titlePlaceholder?: string;
    descriptionPlaceholder?: string;
  };
}

export function FeedbackDialog({ open, onOpenChange, preset }: FeedbackDialogProps) {
  const pathname = usePathname();
  const [type, setType] = useState(preset?.type ?? "feature");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);

  const canSubmit = title.trim().length >= 3 && description.trim().length >= 10;

  function resetForm() {
    setType(preset?.type ?? "feature");
    setTitle("");
    setDescription("");
    setStatus("idle");
    setErrorMsg("");
    setTitleTouched(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title, description, pageUrl: pathname }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // 409 = we already have an identical submission from this user.
        // Treat it as success: the user's intent was recorded either way.
        if (res.status === 409) {
          setStatus("success");
          setTimeout(() => {
            onOpenChange(false);
            resetForm();
          }, 3000);
          return;
        }
        throw new Error(data.error || "Failed to submit feedback");
      }

      setStatus("success");
      setTimeout(() => {
        onOpenChange(false);
        resetForm();
      }, 3000);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      onOpenChange(isOpen);
      if (!isOpen) resetForm();
    }}>
      <DialogContent className="sm:max-w-md">
        {status === "success" ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
              <CheckCircle2 className="h-6 w-6 text-accent-soft-foreground" />
            </div>
            <div className="text-center">
              <p className="font-semibold">Your feedback is on its way</p>
              <p className="text-sm text-muted-foreground mt-2">
                We&apos;ve received your submission and will review it soon.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{preset?.heading ?? "Send us your thoughts"}</DialogTitle>
              <DialogDescription>
                {preset?.subheading ?? "Help shape The Fintech Talent Brief"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {errorMsg && (
                <div className="p-3 rounded-lg text-sm bg-destructive/10 text-destructive border border-destructive/20">
                  {errorMsg}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEEDBACK_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label htmlFor="feedback-title" className="text-sm font-medium">
                  Title
                </label>
                <Input
                  id="feedback-title"
                  placeholder={
                    preset?.titlePlaceholder ??
                    TITLE_PLACEHOLDERS[type] ??
                    "What would you like to suggest?"
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 200))}
                  onBlur={() => setTitleTouched(true)}
                  aria-invalid={titleTouched && title.trim().length < 3}
                  className="transition-colors duration-200"
                />
                {titleTouched && title.trim().length < 3 && (
                  <p className="text-xs text-destructive">
                    Title must be at least 3 characters
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="feedback-description" className="text-sm font-medium">
                    Details
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {description.length}/5000
                  </span>
                </div>
                <Textarea
                  id="feedback-description"
                  placeholder={
                    preset?.descriptionPlaceholder ??
                    "Share any context that helps us understand your feedback."
                  }
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
                  maxLength={5000}
                  className="min-h-[120px] max-h-[300px] resize-none"
                />
                {description.length > 0 && description.trim().length < 10 && (
                  <p className="text-xs text-destructive">
                    Please provide at least 10 characters of detail
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={status === "loading"}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit || status === "loading"}
                className="min-w-[100px]"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
