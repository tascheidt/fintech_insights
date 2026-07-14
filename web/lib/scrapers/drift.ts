import type { ATSDetectionResult } from "./detect-ats";

/**
 * Pure decision logic for the weekly scraper-drift check
 * (`web/scripts/scraper-drift-check.ts`). Separated from the script so the
 * rules are unit-testable without network or DB.
 *
 * The check exists because ATS configs rot silently: a company migrates its
 * board (Koho → Ashby, July 2026; Revolut's URL shape, June 2026) and the
 * stored `ats_type` / `ats_identifier` / `careers_url` keep pointing at the
 * old world. The daily health alerts only watch *active* companies' scrape
 * outcomes — nothing re-asks whether a *deactivated* company's board came
 * back to life, or whether an active company's careers URL now resolves to a
 * different provider. This module answers both.
 */

/**
 * Providers with cheap public JSON board endpoints we can probe with a
 * single GET. Browser-based ATSes (workday, phenom, …) are out of scope —
 * probing them needs Puppeteer and the daily scrape already covers them.
 */
export const API_PROBEABLE_ATS = [
  "lever",
  "greenhouse",
  "workable",
  "ashby",
] as const;

export type ProbeableAts = (typeof API_PROBEABLE_ATS)[number];

export function isProbeableAts(atsType: string): atsType is ProbeableAts {
  return (API_PROBEABLE_ATS as readonly string[]).includes(
    atsType.toLowerCase()
  );
}

/** Result of one GET against a provider's public board endpoint. */
export interface BoardProbe {
  provider: string;
  identifier: string;
  /** true when the endpoint answered 2xx with a parseable board. */
  ok: boolean;
  /** Number of open roles the board reports; null when !ok. */
  jobCount: number | null;
  error?: string;
}

export type DriftFindingKind =
  /** Inactive fintech company whose board is live somewhere with open roles. */
  | "dormant_live_board"
  /** Active company whose careers_url resolves to a different ATS/identifier than configured. */
  | "ats_drift"
  /** Active company whose configured API board endpoint no longer answers. */
  | "dead_config";

export interface DriftFinding {
  kind: DriftFindingKind;
  /** e.g. "lever/koho" */
  configured: string;
  /** e.g. "ashby/koho (25 jobs)" — best live/detected alternative, if any. */
  detected: string | null;
  detail: string;
  deactivatedReason: string | null;
}

export interface CompanyDriftInput {
  isActive: boolean;
  tier: string | null;
  atsType: string;
  atsIdentifier: string;
  /** detectATSFromUrl(careers_url), or null when there is no careers_url. */
  urlDetection: ATSDetectionResult | null;
  /** Probe of the CONFIGURED board (API-probeable ATS only), else null. */
  configuredProbe: BoardProbe | null;
  /** Slug-sweep probes: the company slug tried as identifier on each probeable provider. */
  sweepProbes: BoardProbe[];
  deactivatedReason: string | null;
}

function describeProbe(p: BoardProbe): string {
  return `${p.provider}/${p.identifier} (${p.jobCount ?? 0} jobs)`;
}

function liveProbes(probes: BoardProbe[]): BoardProbe[] {
  return probes.filter((p) => p.ok && (p.jobCount ?? 0) > 0);
}

/**
 * Evaluate one company's probes into zero or more findings.
 *
 * Rules:
 *  - ACTIVE company, careers_url detects (high confidence) a DIFFERENT
 *    ats_type or ats_identifier than configured → `ats_drift`.
 *  - ACTIVE company on an API-probeable ATS whose configured endpoint
 *    errored → `dead_config` (with any live sweep hit named as the likely
 *    destination).
 *  - INACTIVE `tier='fintech'` company with ANY live board (configured
 *    probe, or slug sweep) showing >0 roles → `dormant_live_board`. This is
 *    the check that would have caught Koho months earlier: deactivated with
 *    a dead Lever config while jobs.ashbyhq.com/koho filled up with roles.
 *    Incumbent-tier companies are NOT probed for dormancy — they're parked
 *    intentionally by the incumbent-tracking flag, not forgotten.
 */
export function evaluateCompanyDrift(input: CompanyDriftInput): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const configured = `${input.atsType}/${input.atsIdentifier}`;

  if (input.isActive) {
    const det = input.urlDetection;
    if (det?.detected && det.confidence === "high" && det.atsType) {
      const typeMismatch =
        det.atsType.toLowerCase() !== input.atsType.toLowerCase();
      const idMismatch =
        !typeMismatch &&
        det.atsIdentifier !== undefined &&
        det.atsIdentifier.toLowerCase() !== input.atsIdentifier.toLowerCase();
      if (typeMismatch || idMismatch) {
        findings.push({
          kind: "ats_drift",
          configured,
          detected: `${det.atsType}/${det.atsIdentifier ?? "?"}`,
          detail: typeMismatch
            ? `careers_url resolves to ${det.atsType} but the stored config scrapes ${input.atsType}. The company likely migrated ATS — update ats_type/ats_identifier (see fix-koho-ashby.ts for the repair pattern).`
            : `careers_url resolves to identifier '${det.atsIdentifier}' but the stored config scrapes '${input.atsIdentifier}'.`,
          deactivatedReason: null,
        });
      }
    }

    if (input.configuredProbe && !input.configuredProbe.ok) {
      const alternatives = liveProbes(input.sweepProbes);
      findings.push({
        kind: "dead_config",
        configured,
        detected: alternatives.length > 0 ? describeProbe(alternatives[0]) : null,
        detail:
          `Configured board endpoint no longer answers` +
          (input.configuredProbe.error
            ? ` (${input.configuredProbe.error})`
            : "") +
          (alternatives.length > 0
            ? `. A live board was found at ${alternatives
                .map(describeProbe)
                .join(", ")} — the company likely moved there.`
            : `. No live board found on ${API_PROBEABLE_ATS.join("/")} under this company's slug; check the careers site manually.`),
        deactivatedReason: null,
      });
    }

    return findings;
  }

  // Inactive: only fintech-tier companies are probed for dormancy.
  if (input.tier !== "fintech") return findings;

  const live = liveProbes([
    ...(input.configuredProbe ? [input.configuredProbe] : []),
    ...input.sweepProbes,
  ]);
  if (live.length > 0) {
    findings.push({
      kind: "dormant_live_board",
      configured,
      detected: describeProbe(live[0]),
      detail: `Company is deactivated but a live board with open roles exists at ${live
        .map(describeProbe)
        .join(
          ", "
        )}. If tracking should resume, fix the ATS config and re-activate (see fix-koho-ashby.ts). If the deactivation is intentional, record why in companies.deactivated_reason so this weekly reminder carries the context.`,
      deactivatedReason: input.deactivatedReason,
    });
  }

  return findings;
}
