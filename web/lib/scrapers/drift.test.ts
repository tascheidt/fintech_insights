/**
 * Tests for the pure drift-evaluation rules behind the weekly
 * scraper-drift check (`scripts/scraper-drift-check.ts`).
 *
 * The canonical fixture is the Koho incident (July 2026): company
 * deactivated with a dead Lever config while its real board filled up on
 * Ashby. `dormant_live_board` must fire on exactly that shape.
 */

import { describe, expect, it } from "vitest";
import {
  evaluateCompanyDrift,
  isProbeableAts,
  type BoardProbe,
  type CompanyDriftInput,
} from "./drift";

const probe = (over: Partial<BoardProbe>): BoardProbe => ({
  provider: "ashby",
  identifier: "koho",
  ok: true,
  jobCount: 25,
  ...over,
});

const base: CompanyDriftInput = {
  isActive: true,
  tier: "fintech",
  atsType: "ashby",
  atsIdentifier: "wealthsimple",
  urlDetection: {
    detected: true,
    atsType: "ashby",
    atsIdentifier: "wealthsimple",
    confidence: "high",
  },
  configuredProbe: probe({ identifier: "wealthsimple", jobCount: 40 }),
  sweepProbes: [],
  deactivatedReason: null,
};

describe("evaluateCompanyDrift", () => {
  describe("healthy configs stay silent", () => {
    it("active company whose URL detection and probe both match config", () => {
      expect(evaluateCompanyDrift(base)).toEqual([]);
    });

    it("active company with an undetectable careers_url (generic site) and healthy probe", () => {
      // Koho's OLD careers_url (koho.ca/careers) detects nothing — that
      // alone is not drift.
      expect(
        evaluateCompanyDrift({
          ...base,
          urlDetection: { detected: false, confidence: "low" },
        })
      ).toEqual([]);
    });

    it("inactive fintech company with no live board anywhere (genuinely gone)", () => {
      expect(
        evaluateCompanyDrift({
          ...base,
          isActive: false,
          configuredProbe: probe({ ok: false, jobCount: null }),
          sweepProbes: [probe({ provider: "lever", ok: false, jobCount: null })],
        })
      ).toEqual([]);
    });
  });

  describe("ats_drift (active company, careers_url disagrees with config)", () => {
    it("fires when careers_url resolves to a different provider", () => {
      // The forward-looking Koho shape: careers_url updated to Ashby but
      // ats_type still says lever.
      const findings = evaluateCompanyDrift({
        ...base,
        atsType: "lever",
        atsIdentifier: "koho",
        urlDetection: {
          detected: true,
          atsType: "ashby",
          atsIdentifier: "koho",
          confidence: "high",
        },
      });
      expect(findings).toHaveLength(1);
      expect(findings[0].kind).toBe("ats_drift");
      expect(findings[0].configured).toBe("lever/koho");
      expect(findings[0].detected).toBe("ashby/koho");
    });

    it("fires on an identifier mismatch within the same provider", () => {
      const findings = evaluateCompanyDrift({
        ...base,
        urlDetection: {
          detected: true,
          atsType: "ashby",
          atsIdentifier: "wealthsimple-eu",
          confidence: "high",
        },
      });
      expect(findings).toHaveLength(1);
      expect(findings[0].kind).toBe("ats_drift");
    });

    it("ignores low-confidence detections", () => {
      expect(
        evaluateCompanyDrift({
          ...base,
          atsType: "lever",
          urlDetection: {
            detected: true,
            atsType: "ashby",
            atsIdentifier: "koho",
            confidence: "low",
          },
        })
      ).toEqual([]);
    });

    it("is case-insensitive on type and identifier", () => {
      expect(
        evaluateCompanyDrift({
          ...base,
          atsType: "Ashby",
          atsIdentifier: "Wealthsimple",
        })
      ).toEqual([]);
    });
  });

  describe("dead_config (active company, configured endpoint gone)", () => {
    it("fires when the configured board errors, naming the live alternative", () => {
      const findings = evaluateCompanyDrift({
        ...base,
        atsType: "lever",
        atsIdentifier: "koho",
        urlDetection: { detected: false, confidence: "low" },
        configuredProbe: probe({
          provider: "lever",
          ok: false,
          jobCount: null,
          error: "HTTP 404",
        }),
        sweepProbes: [probe({ provider: "ashby", identifier: "koho" })],
      });
      expect(findings).toHaveLength(1);
      expect(findings[0].kind).toBe("dead_config");
      expect(findings[0].detected).toBe("ashby/koho (25 jobs)");
      expect(findings[0].detail).toContain("HTTP 404");
    });

    it("fires without an alternative when the sweep finds nothing", () => {
      const findings = evaluateCompanyDrift({
        ...base,
        urlDetection: null,
        configuredProbe: probe({ ok: false, jobCount: null }),
        sweepProbes: [probe({ provider: "lever", ok: false, jobCount: null })],
      });
      expect(findings).toHaveLength(1);
      expect(findings[0].detected).toBeNull();
    });

    it("does not fire for a live-but-empty configured board (covered by the daily watchdog)", () => {
      expect(
        evaluateCompanyDrift({
          ...base,
          urlDetection: null,
          configuredProbe: probe({ jobCount: 0 }),
        })
      ).toEqual([]);
    });
  });

  describe("dormant_live_board (inactive fintech, board alive somewhere)", () => {
    it("fires the Koho shape: dead configured board, live slug-sweep hit", () => {
      const findings = evaluateCompanyDrift({
        ...base,
        isActive: false,
        atsType: "lever",
        atsIdentifier: "koho",
        urlDetection: { detected: false, confidence: "low" },
        configuredProbe: probe({
          provider: "lever",
          ok: false,
          jobCount: null,
        }),
        sweepProbes: [probe({ provider: "ashby", identifier: "koho" })],
        deactivatedReason: null,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0].kind).toBe("dormant_live_board");
      expect(findings[0].detected).toBe("ashby/koho (25 jobs)");
    });

    it("fires when the CONFIGURED board itself is still live", () => {
      const findings = evaluateCompanyDrift({
        ...base,
        isActive: false,
        configuredProbe: probe({ identifier: "wealthsimple", jobCount: 12 }),
      });
      expect(findings).toHaveLength(1);
      expect(findings[0].kind).toBe("dormant_live_board");
    });

    it("carries the deactivated_reason for human triage", () => {
      const findings = evaluateCompanyDrift({
        ...base,
        isActive: false,
        deactivatedReason: "ATS moved — investigating",
      });
      expect(findings[0].deactivatedReason).toBe("ATS moved — investigating");
    });

    it("does not fire on a live board with zero roles", () => {
      expect(
        evaluateCompanyDrift({
          ...base,
          isActive: false,
          configuredProbe: probe({ jobCount: 0 }),
          sweepProbes: [probe({ provider: "lever", jobCount: 0 })],
        })
      ).toEqual([]);
    });

    it("never probes incumbent-tier companies — they're parked by the flag, not lost", () => {
      expect(
        evaluateCompanyDrift({
          ...base,
          isActive: false,
          tier: "incumbent",
          configuredProbe: probe({ jobCount: 1400 }),
        })
      ).toEqual([]);
    });
  });
});

describe("isProbeableAts", () => {
  it("accepts the four public-API providers, case-insensitively", () => {
    for (const t of ["lever", "greenhouse", "workable", "Ashby"]) {
      expect(isProbeableAts(t)).toBe(true);
    }
  });

  it("rejects browser-based and tenant-specific ATS types", () => {
    for (const t of ["workday-td", "phenom", "scotiabank", "revolut", "custom"]) {
      expect(isProbeableAts(t)).toBe(false);
    }
  });
});
