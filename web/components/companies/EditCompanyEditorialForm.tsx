/**
 * EditCompanyEditorialForm — author-curated editorial fields for a company.
 *
 * Lives alongside `EditCompanyForm` (which owns the ATS / config block).
 * Surfaces:
 *  - thesis / thesis_sub / interpretation / last_change / last_change_at
 *  - bets (strategic bets repeater, max 6)
 *
 * Rendered inside the same EditCompanyForm card; submits via the same
 * PATCH /api/companies/[id] handler. Editor / admin only — gating is
 * enforced server-side in the API route.
 */

"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  TrendingUp,
  Minus,
  TrendingDown,
  Plus,
  Lightbulb,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type Pivot = "new" | "accel" | "cont" | "quiet";

export interface BetEvidence {
  when: string;
  text: string;
  type: "internal" | "external";
}

export interface Bet {
  id?: string;
  title: string;
  claim: string;
  pivot: Pivot;
  confidence: 1 | 2 | 3 | 4 | 5;
  evidence: BetEvidence[];
  forward_signal: string;
  job_filter?: { function?: string; theme?: string };
}

export interface EditorialState {
  thesis: string;
  thesisSub: string;
  interpretation: string;
  lastChange: string;
  lastChangeAt: string;
  bets: Bet[];
}

export interface EditCompanyEditorialFormProps {
  value: EditorialState;
  onChange: (next: EditorialState) => void;
  /**
   * When provided, enables the "Suggest from hiring data" panel. The form
   * fetches `/api/companies/${companyId}/bet-suggestions` for rule-based
   * candidate bets the editor can append.
   */
  companyId?: string;
}

interface SuggestedBetPayload {
  source: "accel" | "cold-start" | "quiet" | "keyword-burst";
  title: string;
  claim: string;
  pivot: Pivot;
  confidence: 1 | 2 | 3 | 4 | 5;
  evidence: BetEvidence[];
  forward_signal: string;
  job_filter?: { function?: string; theme?: string };
}

const PIVOT_OPTIONS: Array<{ value: Pivot; label: string; Icon: typeof Sparkles }> = [
  { value: "new", label: "New pattern", Icon: Sparkles },
  { value: "accel", label: "Accelerating", Icon: TrendingUp },
  { value: "cont", label: "Continuity", Icon: Minus },
  { value: "quiet", label: "Going quiet", Icon: TrendingDown },
];

const BLANK_BET: Bet = {
  title: "",
  claim: "",
  pivot: "cont",
  confidence: 3,
  evidence: [],
  forward_signal: "",
  job_filter: {},
};

const BLANK_EVIDENCE: BetEvidence = {
  when: "",
  text: "",
  type: "internal",
};

export function EditCompanyEditorialForm({
  value,
  onChange,
  companyId,
}: EditCompanyEditorialFormProps) {
  const idBase = useId();
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedBetPayload[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  async function fetchSuggestions() {
    if (!companyId) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/bet-suggestions`);
      const data = await res.json();
      if (!res.ok) {
        setSuggestError(data.error ?? "Failed to load suggestions");
      } else {
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      }
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : String(err));
    } finally {
      setSuggesting(false);
    }
  }

  function acceptSuggestion(s: SuggestedBetPayload) {
    if (value.bets.length >= 6) return;
    const next: Bet = {
      title: s.title,
      claim: s.claim,
      pivot: s.pivot,
      confidence: s.confidence,
      evidence: s.evidence.map((e) => ({ ...e })),
      forward_signal: s.forward_signal,
      job_filter: s.job_filter ? { ...s.job_filter } : {},
    };
    onChange({ ...value, bets: [...value.bets, next] });
    setSuggestions((prev) => prev.filter((p) => p.title !== s.title));
  }

  function setField<K extends keyof EditorialState>(
    key: K,
    next: EditorialState[K]
  ) {
    onChange({ ...value, [key]: next });
  }

  function updateBet(index: number, next: Bet) {
    const bets = value.bets.slice();
    bets[index] = next;
    setField("bets", bets);
  }

  function addBet() {
    if (value.bets.length >= 6) return;
    setField("bets", [...value.bets, { ...BLANK_BET }]);
  }

  function removeBet(index: number) {
    setField(
      "bets",
      value.bets.filter((_, i) => i !== index)
    );
  }

  return (
    <div className="space-y-6 border-t pt-6">
      <div>
        <h3 className="text-base font-semibold">Editorial</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Author-curated fields that drive the v2 Companies index and the
          company drill-down. Leave blank if there&rsquo;s nothing meaningful to say.
        </p>
      </div>

      {/* Thesis */}
      <div>
        <label htmlFor={`${idBase}-thesis`} className="text-sm font-medium">
          Working thesis
        </label>
        <Textarea
          id={`${idBase}-thesis`}
          maxLength={200}
          rows={2}
          value={value.thesis}
          onChange={(e) => setField("thesis", e.target.value)}
          className="mt-1"
        />
        <p className="text-xs text-muted-foreground mt-1">
          1&ndash;2 sentences on what this company is doing strategically. Markdown
          italics supported via <code>*asterisks*</code>. {value.thesis.length}/200
        </p>
      </div>

      {/* Thesis sub */}
      <div>
        <label htmlFor={`${idBase}-thesis-sub`} className="text-sm font-medium">
          Thesis sub-line
        </label>
        <Textarea
          id={`${idBase}-thesis-sub`}
          maxLength={280}
          rows={2}
          value={value.thesisSub}
          onChange={(e) => setField("thesisSub", e.target.value)}
          className="mt-1"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Optional. What informs this thesis (e.g. &ldquo;Inferred from 6 months of
          hiring data &amp; observed product launches&rdquo;). {value.thesisSub.length}/280
        </p>
      </div>

      {/* Interpretation */}
      <div>
        <label
          htmlFor={`${idBase}-interpretation`}
          className="text-sm font-medium"
        >
          Hiring interpretation
        </label>
        <Textarea
          id={`${idBase}-interpretation`}
          maxLength={600}
          rows={4}
          value={value.interpretation}
          onChange={(e) => setField("interpretation", e.target.value)}
          className="mt-1"
        />
        <p className="text-xs text-muted-foreground mt-1">
          2&ndash;4 sentences interpreting recent hiring. Author-written, not LLM.{" "}
          {value.interpretation.length}/600
        </p>
      </div>

      {/* Last change */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
        <div>
          <label
            htmlFor={`${idBase}-last-change`}
            className="text-sm font-medium"
          >
            Last meaningful change
          </label>
          <Input
            id={`${idBase}-last-change`}
            maxLength={200}
            value={value.lastChange}
            onChange={(e) => setField("lastChange", e.target.value)}
            className="mt-1"
            placeholder="e.g. USD spending account launched"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Surfaced on the Companies index row.
          </p>
        </div>
        <div>
          <label
            htmlFor={`${idBase}-last-change-at`}
            className="text-sm font-medium"
          >
            When
          </label>
          <Input
            id={`${idBase}-last-change-at`}
            type="date"
            value={value.lastChangeAt}
            onChange={(e) => setField("lastChangeAt", e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      {/* Bets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-medium">Strategic bets</h4>
            <p className="text-xs text-muted-foreground">
              Up to 6 bets. {value.bets.length}/6
            </p>
          </div>
          <div className="flex items-center gap-2">
            {companyId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchSuggestions}
                disabled={suggesting}
              >
                <Lightbulb className="h-3.5 w-3.5" />
                {suggesting ? "Reading hiring…" : "Suggest from hiring data"}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addBet}
              disabled={value.bets.length >= 6}
            >
              <Plus className="h-3.5 w-3.5" /> Add bet
            </Button>
          </div>
        </div>

        {suggestError && (
          <p className="text-xs text-destructive">{suggestError}</p>
        )}

        {suggestions.length > 0 && (
          <div className="rounded-md border border-dashed bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">
                {suggestions.length} candidate{" "}
                {suggestions.length === 1 ? "bet" : "bets"} from hiring rules.
                Edit before saving — these are starting points, not finished
                editorial.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSuggestions([])}
                aria-label="Dismiss suggestions"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <ul className="space-y-2">
              {suggestions.map((s) => (
                <li
                  key={s.title}
                  className="flex items-start gap-3 rounded border bg-background p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {s.claim}
                    </p>
                    <p className="mt-1 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
                      Source · {s.source.replace("-", " ")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => acceptSuggestion(s)}
                    disabled={value.bets.length >= 6}
                  >
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {value.bets.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-md border border-dashed p-4 text-center">
            No bets yet. Add one when the hiring tells a clear story.
          </p>
        ) : (
          value.bets.map((bet, i) => (
            <BetEditor
              key={bet.id ?? i}
              bet={bet}
              index={i}
              onChange={(next) => updateBet(i, next)}
              onRemove={() => removeBet(i)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// BetEditor — single Bet card with evidence sub-repeater
// ----------------------------------------------------------------------------

function BetEditor({
  bet,
  index,
  onChange,
  onRemove,
}: {
  bet: Bet;
  index: number;
  onChange: (next: Bet) => void;
  onRemove: () => void;
}) {
  function set<K extends keyof Bet>(key: K, next: Bet[K]) {
    onChange({ ...bet, [key]: next });
  }

  function updateEvidence(i: number, next: BetEvidence) {
    const ev = bet.evidence.slice();
    ev[i] = next;
    set("evidence", ev);
  }

  function addEvidence() {
    if (bet.evidence.length >= 6) return;
    set("evidence", [...bet.evidence, { ...BLANK_EVIDENCE }]);
  }

  function removeEvidence(i: number) {
    set(
      "evidence",
      bet.evidence.filter((_, idx) => idx !== i)
    );
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
          Bet {index + 1}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label="Remove bet"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div>
        <label className="text-sm font-medium">Title</label>
        <Input
          value={bet.title}
          onChange={(e) => set("title", e.target.value)}
          maxLength={160}
          className="mt-1"
          placeholder="e.g. Card platform expansion"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Claim</label>
        <Textarea
          value={bet.claim}
          onChange={(e) => set("claim", e.target.value)}
          maxLength={800}
          rows={3}
          className="mt-1"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Pivot kind</label>
          <div className="mt-1 flex flex-wrap gap-1">
            {PIVOT_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => set("pivot", value)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium",
                  bet.pivot === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Confidence</label>
          <div className="mt-1 inline-flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => set("confidence", n as 1 | 2 | 3 | 4 | 5)}
                className={cn(
                  "h-8 w-8 rounded-md border text-xs font-medium",
                  bet.confidence >= n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background text-muted-foreground hover:bg-muted"
                )}
                aria-label={`Confidence ${n}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Evidence */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Evidence</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addEvidence}
            disabled={bet.evidence.length >= 6}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
        {bet.evidence.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Add 1&ndash;6 supporting items.
          </p>
        ) : (
          bet.evidence.map((ev, i) => (
            <div
              key={i}
              className="grid grid-cols-1 sm:grid-cols-[110px_1fr_140px_auto] gap-2 items-start rounded-md border bg-background p-2"
            >
              <Input
                value={ev.when}
                onChange={(e) =>
                  updateEvidence(i, { ...ev, when: e.target.value })
                }
                placeholder="When (e.g. 6d, Mar 12)"
                maxLength={80}
              />
              <Input
                value={ev.text}
                onChange={(e) =>
                  updateEvidence(i, { ...ev, text: e.target.value })
                }
                placeholder="Evidence text"
                maxLength={400}
              />
              <select
                value={ev.type}
                onChange={(e) =>
                  updateEvidence(i, {
                    ...ev,
                    type: e.target.value as "internal" | "external",
                  })
                }
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="internal">Internal</option>
                <option value="external">External</option>
              </select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeEvidence(i)}
                aria-label="Remove evidence"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      <div>
        <label className="text-sm font-medium">Forward signal</label>
        <Textarea
          value={bet.forward_signal}
          onChange={(e) => set("forward_signal", e.target.value)}
          maxLength={400}
          rows={2}
          className="mt-1"
          placeholder="What you'd watch for next."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Job filter — function</label>
          <Input
            value={bet.job_filter?.function ?? ""}
            onChange={(e) =>
              set("job_filter", {
                ...(bet.job_filter ?? {}),
                function: e.target.value,
              })
            }
            maxLength={120}
            className="mt-1"
            placeholder="e.g. Compliance"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Job filter — theme</label>
          <Input
            value={bet.job_filter?.theme ?? ""}
            onChange={(e) =>
              set("job_filter", {
                ...(bet.job_filter ?? {}),
                theme: e.target.value,
              })
            }
            maxLength={120}
            className="mt-1"
            placeholder="e.g. KYC modernisation"
          />
        </div>
      </div>
    </div>
  );
}
