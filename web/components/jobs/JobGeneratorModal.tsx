"use client";

import * as React from "react";
import { Sparkles, Copy, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { JobsListRow } from "@/lib/dashboard-queries";

interface JobGeneratorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedJobs: JobsListRow[];
}

const SENIORITY_OPTIONS = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "lead",
  "executive",
] as const;

const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "conversational", label: "Conversational" },
  { value: "startup", label: "Startup-friendly" },
  { value: "corporate", label: "Corporate / formal" },
] as const;

export function JobGeneratorModal({
  open,
  onOpenChange,
  selectedJobs,
}: JobGeneratorModalProps) {
  const [companyName, setCompanyName] = React.useState("");
  const [seniority, setSeniority] = React.useState("senior");
  const [tone, setTone] = React.useState("professional");
  const [additionalNotes, setAdditionalNotes] = React.useState("");

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const resetForm = React.useCallback(() => {
    setLoading(false);
    setError(null);
    setResult(null);
    setCopied(false);
  }, []);

  React.useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/ai/generate-posting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobIds: selectedJobs.map((j) => j.id),
          companyName: companyName.trim() || undefined,
          seniority,
          tone,
          additionalNotes: additionalNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate posting");
        return;
      }

      setResult(data.posting);
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Non-fatal
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-pacific-500" aria-hidden />
            Generate Job Posting
          </DialogTitle>
          <DialogDescription>
            Synthesize a new job description from{" "}
            {selectedJobs.length === 1
              ? "1 selected posting"
              : `${selectedJobs.length} selected postings`}
            .
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <>
            <div className="space-y-4 py-2">
              {/* Selected jobs summary */}
              <div className="rounded-lg border border-sand-200 bg-sand-50 p-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-sand-500">
                  Source postings
                </p>
                <ul className="space-y-1">
                  {selectedJobs.map((j) => (
                    <li
                      key={j.id}
                      className="text-[12.5px] text-sand-700 truncate"
                      title={`${j.title} — ${j.companyName}`}
                    >
                      <span className="font-medium text-sand-900">{j.title}</span>
                      <span className="text-sand-500"> — {j.companyName}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Parameters */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-sand-700">
                    Target company name
                  </label>
                  <Input
                    placeholder="e.g. Acme Fintech"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-sand-700">
                    Seniority level
                  </label>
                  <Select value={seniority} onValueChange={setSeniority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SENIORITY_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-sand-700">
                  Tone
                </label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONE_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-sand-700">
                  Additional notes{" "}
                  <span className="text-sand-400">(optional)</span>
                </label>
                <Textarea
                  placeholder="Any specific requirements, responsibilities, or context to include…"
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Draft warning */}
              <div className="flex items-start gap-2 rounded-lg border border-sun-200 bg-sun-50 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sun-600" aria-hidden />
                <p className="text-[12px] leading-relaxed text-sun-800">
                  The generated posting is an AI draft. Review it carefully — the
                  model may invent requirements or perks not present in the source
                  postings.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-sunset-200 bg-sunset-50 px-3 py-2.5 text-[12.5px] text-sunset-800">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={loading}>
                {loading ? (
                  "Generating…"
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    Generate
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-sand-200 bg-sand-50 p-4">
                <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-sand-900">
                  {result}
                </pre>
              </div>

              {/* Draft warning */}
              <div className="flex items-start gap-2 rounded-lg border border-sun-200 bg-sun-50 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sun-600" aria-hidden />
                <p className="text-[12px] leading-relaxed text-sun-800">
                  This is an AI-generated draft. Review and edit before using.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setResult(null)}>
                Back to settings
              </Button>
              <Button onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    Copy to clipboard
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
