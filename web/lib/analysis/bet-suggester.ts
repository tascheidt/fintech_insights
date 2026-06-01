/**
 * Rule-based bet suggester.
 *
 * Lightweight, deterministic counterpart to the LLM editorial engine. Given
 * a company's pivot classification + function distribution + top keywords,
 * we propose 1–4 candidate bets the editor can review and add to the
 * company's editorial. Candidates have:
 *   - title + claim (template)
 *   - pivot (from rule)
 *   - default confidence (2 — author should adjust)
 *   - 1–2 internal evidence rows (auto-derived)
 *   - forward_signal stub
 *   - job_filter.function set to the relevant function group
 *
 * No AI calls. Safe to call on every form load.
 */

import { subDays } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyCompanyPivot,
  type PivotKind,
  type PivotSignal,
} from "@/lib/dashboard-queries";
import { getCategoryGroup, type RoleCategory } from "./function-categories";

export interface SuggestedEvidence {
  when: string;
  text: string;
  type: "internal" | "external";
}

export interface SuggestedBet {
  /** Source signal used to generate the candidate — surfaced to the editor. */
  source: "accel" | "cold-start" | "quiet" | "keyword-burst";
  title: string;
  claim: string;
  pivot: PivotKind;
  confidence: 1 | 2 | 3 | 4 | 5;
  evidence: SuggestedEvidence[];
  forward_signal: string;
  job_filter?: { function?: string; theme?: string };
}

const KEYWORD_BURST_RATIO = 3; // 30d count must exceed (per-day baseline × 30) × this
const KEYWORD_BURST_MIN_RECENT = 4; // need at least this many in last 30d

interface SuggestionContext {
  companyId: string;
  pivot: { kind: PivotKind; signals: PivotSignal[] };
  recentByGroup: Map<string, number>;
  recentByKeyword: Map<string, number>;
  baselineByKeyword: Map<string, number>;
  baselineByGroup: Map<string, number>;
}

async function buildContext(companyId: string): Promise<SuggestionContext> {
  const supabase = createAdminClient();
  const recent30 = subDays(new Date(), 30).toISOString();
  const baseline90 = subDays(new Date(), 90).toISOString();

  const [{ data: recentJobs }, { data: baselineJobs }] = await Promise.all([
    supabase
      .from("active_job_postings")
      .select("function_category, keywords")
      .eq("company_id", companyId)
      .gte("first_seen_date", recent30)
      .not("function_category", "is", null),
    supabase
      .from("active_job_postings")
      .select("function_category, keywords")
      .eq("company_id", companyId)
      .gte("first_seen_date", baseline90)
      .not("function_category", "is", null),
  ]);

  const recentByGroup = new Map<string, number>();
  const recentByKeyword = new Map<string, number>();
  for (const j of recentJobs ?? []) {
    if (j.function_category) {
      const g = getCategoryGroup(j.function_category as RoleCategory);
      recentByGroup.set(g, (recentByGroup.get(g) ?? 0) + 1);
    }
    for (const k of (j.keywords ?? []) as string[]) {
      const t = k?.trim().toLowerCase();
      if (!t) continue;
      recentByKeyword.set(t, (recentByKeyword.get(t) ?? 0) + 1);
    }
  }

  const baselineByGroup = new Map<string, number>();
  const baselineByKeyword = new Map<string, number>();
  for (const j of baselineJobs ?? []) {
    if (j.function_category) {
      const g = getCategoryGroup(j.function_category as RoleCategory);
      baselineByGroup.set(g, (baselineByGroup.get(g) ?? 0) + 1);
    }
    for (const k of (j.keywords ?? []) as string[]) {
      const t = k?.trim().toLowerCase();
      if (!t) continue;
      baselineByKeyword.set(t, (baselineByKeyword.get(t) ?? 0) + 1);
    }
  }

  const pivot = await classifyCompanyPivot(companyId, supabase);

  return {
    companyId,
    pivot,
    recentByGroup,
    recentByKeyword,
    baselineByGroup,
    baselineByKeyword,
  };
}

function titleCase(group: string): string {
  return group
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function evidenceFromGroupCount(group: string, count: number): SuggestedEvidence {
  return {
    when: "30d",
    text: `${count} ${group} ${count === 1 ? "posting" : "postings"} in the last 30 days.`,
    type: "internal",
  };
}

function evidenceFromKeywordCount(
  keyword: string,
  count: number
): SuggestedEvidence {
  return {
    when: "30d",
    text: `"${keyword}" appears in ${count} ${count === 1 ? "posting" : "postings"} this month.`,
    type: "internal",
  };
}

function fromAccelSignal(
  signal: PivotSignal,
  ctx: SuggestionContext
): SuggestedBet | null {
  const group = signal.label.split(" ")[0]; // "engineering accelerating" -> "engineering"
  const recent = ctx.recentByGroup.get(group) ?? 0;
  if (recent < 2) return null;
  const display = titleCase(group);
  return {
    source: "accel",
    title: `${display} acceleration`,
    claim: `${display} hiring is running ahead of trend over the last 30 days. Tighten the editorial claim once the underlying *direction* is clear — what specifically is being built?`,
    pivot: "accel",
    confidence: 2,
    evidence: [evidenceFromGroupCount(group, recent)],
    forward_signal:
      "Watch the next 4 weeks: if the velocity persists, this signals a sustained build-out worth a sharper bet.",
    job_filter: { function: display },
  };
}

function fromColdStartSignal(
  signal: PivotSignal,
  ctx: SuggestionContext
): SuggestedBet | null {
  const group = signal.label.split(" ")[0];
  const recent = ctx.recentByGroup.get(group) ?? 0;
  if (recent < 1) return null;
  const display = titleCase(group);
  return {
    source: "cold-start",
    title: `${display} cold start`,
    claim: `First ${display} postings in over six months. Decide whether this is a *new direction* or a one-off backfill before promoting it to a confident bet.`,
    pivot: "new",
    confidence: 2,
    evidence: [
      evidenceFromGroupCount(group, recent),
      {
        when: "180d",
        text: `No prior ${display} postings in the previous 6 months.`,
        type: "internal",
      },
    ],
    forward_signal:
      "Watch for additional postings in the next 30 days that confirm a sustained move into this function.",
    job_filter: { function: display },
  };
}

function fromQuietSignal(
  signal: PivotSignal,
  ctx: SuggestionContext
): SuggestedBet | null {
  const group = signal.label.split(" ")[0];
  const baseline = ctx.baselineByGroup.get(group) ?? 0;
  const display = titleCase(group);
  return {
    source: "quiet",
    title: `${display} going quiet`,
    claim: `${display} postings have dried up after a sustained baseline. The absence is a signal — re-prioritisation, hiring freeze, or a complete buy?`,
    pivot: "quiet",
    confidence: 2,
    evidence: [
      {
        when: "30d",
        text: `Zero ${display} postings in the last 30 days.`,
        type: "internal",
      },
      {
        when: "90d",
        text: `Prior 90-day baseline: ${baseline} postings.`,
        type: "internal",
      },
    ],
    forward_signal:
      "If the freeze persists past 60 days, treat the gap as evidence rather than noise.",
    job_filter: { function: display },
  };
}

function fromKeywordBurst(
  keyword: string,
  recent: number,
  baseline: number
): SuggestedBet {
  return {
    source: "keyword-burst",
    title: `${titleCase(keyword)} push`,
    claim: `"${keyword}" appears in materially more recent postings than the prior 90-day baseline — likely a focused capability bet. Rewrite this title so it names the *direction*, not the keyword.`,
    pivot: "accel",
    confidence: 2,
    evidence: [
      evidenceFromKeywordCount(keyword, recent),
      {
        when: "90d",
        text: `Baseline: ${baseline} ${baseline === 1 ? "appearance" : "appearances"} in the prior 90 days.`,
        type: "internal",
      },
    ],
    forward_signal:
      "Track which roles cite this keyword next — that's where the build-out is going.",
    job_filter: { theme: keyword },
  };
}

function detectKeywordBursts(ctx: SuggestionContext): SuggestedBet[] {
  const out: SuggestedBet[] = [];
  for (const [keyword, recent] of ctx.recentByKeyword.entries()) {
    if (recent < KEYWORD_BURST_MIN_RECENT) continue;
    const baseline = ctx.baselineByKeyword.get(keyword) ?? 0;
    // baseline includes the recent window — strip it for a fair comparison.
    const priorBaseline = Math.max(0, baseline - recent);
    // Treat per-day rate * 30 as the expected count.
    const expected = (priorBaseline / 60) * 30; // 60 days prior to the 30d window
    if (recent > Math.max(KEYWORD_BURST_MIN_RECENT - 1, expected) * KEYWORD_BURST_RATIO) {
      out.push(fromKeywordBurst(keyword, recent, priorBaseline));
    }
  }
  return out
    .sort((a, b) => {
      const aN = Number(a.evidence[0]?.text.match(/in (\d+)/)?.[1] ?? 0);
      const bN = Number(b.evidence[0]?.text.match(/in (\d+)/)?.[1] ?? 0);
      return bN - aN;
    })
    .slice(0, 2);
}

export async function suggestBets(companyId: string): Promise<SuggestedBet[]> {
  const ctx = await buildContext(companyId);
  const out: SuggestedBet[] = [];
  const seen = new Set<string>();
  for (const sig of ctx.pivot.signals) {
    let bet: SuggestedBet | null = null;
    if (sig.kind === "accel") bet = fromAccelSignal(sig, ctx);
    else if (sig.kind === "new") bet = fromColdStartSignal(sig, ctx);
    else if (sig.kind === "quiet") bet = fromQuietSignal(sig, ctx);
    if (bet && !seen.has(bet.title)) {
      out.push(bet);
      seen.add(bet.title);
    }
  }
  for (const bet of detectKeywordBursts(ctx)) {
    if (!seen.has(bet.title)) {
      out.push(bet);
      seen.add(bet.title);
    }
  }
  return out.slice(0, 4);
}
