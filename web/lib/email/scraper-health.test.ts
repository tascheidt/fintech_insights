/**
 * Tests for the partial-corpus-drop canary threshold helper.
 *
 * The canary in `scraper-health.ts` is the Phase-3 fragility tripwire: it
 * fires when an incumbent scraper returns visibly less than its 7-day
 * baseline today. Silent partial drops are worse than outages (Luke #10)
 * because they look healthy in alerts but rot the dataset.
 *
 * `evaluateCanary` is the pure threshold check extracted so the rule is
 * unit-testable without DB / email infrastructure. Two thresholds must
 * BOTH hold for the canary to fire:
 *   - today < 50% of the 7-day rolling average (the drop)
 *   - rolling > 5 (filter out quiet weeks)
 */

import { describe, expect, it } from "vitest";
import {
  evaluateCanary,
  evaluateStaleness,
  CANARY_DROP_RATIO,
  CANARY_MIN_ROLLING_AVG,
  STALE_SCRAPE_THRESHOLD_DAYS,
} from "./scraper-health";

describe("evaluateCanary", () => {
  describe("fires the canary", () => {
    it("fires when today is well below 50% of the 7-day rolling average", () => {
      // 7-day avg = 10/day, today = 2 → 20% of baseline; well below ratio.
      const decision = evaluateCanary({ today: 2, rolling: 10 });
      expect(decision.fire).toBe(true);
      expect(decision.reason).toBe("fire_partial_corpus_drop");
    });

    it("fires when today is exactly zero against a healthy baseline", () => {
      // The canonical partial-corpus failure: the scraper returns no NEW
      // jobs even though the bank has been posting 10/day all week.
      const decision = evaluateCanary({ today: 0, rolling: 10 });
      expect(decision.fire).toBe(true);
    });

    it("fires at a high-volume bank dropping from 20/day to 5", () => {
      const decision = evaluateCanary({ today: 5, rolling: 20 });
      expect(decision.fire).toBe(true);
    });
  });

  describe("suppresses the canary on quiet baselines", () => {
    it("does NOT fire when rolling average is below the floor (5)", () => {
      // Even a 100% drop should not fire if the baseline is too quiet:
      // a bank that posts 2/day on average can legitimately post 0 today.
      const decision = evaluateCanary({ today: 0, rolling: 2 });
      expect(decision.fire).toBe(false);
      expect(decision.reason).toBe("skip_rolling_avg_below_floor");
    });

    it("does NOT fire when rolling average sits exactly at the floor", () => {
      // The floor uses strict `>`, so 5 is treated as "still too quiet".
      // This keeps the canary silent on borderline-low-volume companies.
      const decision = evaluateCanary({
        today: 0,
        rolling: CANARY_MIN_ROLLING_AVG,
      });
      expect(decision.fire).toBe(false);
      expect(decision.reason).toBe("skip_rolling_avg_below_floor");
    });

    it("does NOT fire when both today and rolling are zero (silent week)", () => {
      const decision = evaluateCanary({ today: 0, rolling: 0 });
      expect(decision.fire).toBe(false);
      expect(decision.reason).toBe("skip_rolling_avg_below_floor");
    });
  });

  describe("suppresses the canary on healthy drops", () => {
    it("does NOT fire when today is above 50% of the rolling avg (e.g. 30% drop)", () => {
      // 7-day avg = 10, today = 7 → only a 30% drop. Normal day-to-day
      // variation, not a scraper break.
      const decision = evaluateCanary({ today: 7, rolling: 10 });
      expect(decision.fire).toBe(false);
      expect(decision.reason).toBe("skip_today_not_below_threshold");
    });

    it("does NOT fire when today equals the rolling average", () => {
      const decision = evaluateCanary({ today: 10, rolling: 10 });
      expect(decision.fire).toBe(false);
    });

    it("does NOT fire when today is exactly 50% of rolling (boundary, strict <)", () => {
      // Threshold is strict `<`, so the boundary case stays silent — a
      // bank that drops exactly to half its baseline is borderline, not
      // alertable.
      const decision = evaluateCanary({ today: 5, rolling: 10 });
      expect(decision.fire).toBe(false);
      expect(decision.reason).toBe("skip_today_not_below_threshold");
    });

    it("does NOT fire when today exceeds the rolling average (busy day)", () => {
      const decision = evaluateCanary({ today: 25, rolling: 10 });
      expect(decision.fire).toBe(false);
    });
  });

  describe("constants reflect documented thresholds", () => {
    it("drop ratio is 50% — anything less than that of baseline trips the alarm", () => {
      expect(CANARY_DROP_RATIO).toBe(0.5);
    });

    it("rolling-average floor is 5 — banks below this don't fire", () => {
      expect(CANARY_MIN_ROLLING_AVG).toBe(5);
    });
  });
});

/**
 * The staleness watchdog is the persistence layer the per-run alerts lack:
 * "failed" and "empty" only see the current run (and "empty" only fires on
 * the transition day), so one missed email became months of silence for
 * Koho (July 2026). `evaluateStaleness` is the pure rule; it must re-fire
 * for as long as the condition holds.
 */
describe("evaluateStaleness", () => {
  const NOW = new Date("2026-07-14T12:00:00Z");
  const daysAgo = (n: number) =>
    new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  const base = {
    lastSuccessAt: daysAgo(1),
    activeJobCount: 25,
    companyCreatedAt: daysAgo(400),
    isSubBrand: false,
    now: NOW,
  };

  describe("healthy companies stay silent", () => {
    it("does not flag a company scraped yesterday with active postings", () => {
      const d = evaluateStaleness(base);
      expect(d.staleScrape).toBe(false);
      expect(d.noActiveJobs).toBe(false);
      expect(d.daysSinceLastSuccess).toBe(1);
    });

    it("does not flag at threshold - 1 days", () => {
      const d = evaluateStaleness({
        ...base,
        lastSuccessAt: daysAgo(STALE_SCRAPE_THRESHOLD_DAYS - 1),
      });
      expect(d.staleScrape).toBe(false);
    });
  });

  describe("stale scrape", () => {
    it("flags a company with no successful scrape in exactly threshold days", () => {
      const d = evaluateStaleness({
        ...base,
        lastSuccessAt: daysAgo(STALE_SCRAPE_THRESHOLD_DAYS),
      });
      expect(d.staleScrape).toBe(true);
      expect(d.daysSinceLastSuccess).toBe(STALE_SCRAPE_THRESHOLD_DAYS);
    });

    it("flags a company that has NEVER had a successful scrape", () => {
      // The Koho end-state: config points at a dead board, every scrape
      // fails or the company predates task tracking.
      const d = evaluateStaleness({ ...base, lastSuccessAt: null });
      expect(d.staleScrape).toBe(true);
      expect(d.daysSinceLastSuccess).toBeNull();
    });

    it("keeps firing far past the threshold (persistent, not transition-day)", () => {
      const d = evaluateStaleness({ ...base, lastSuccessAt: daysAgo(90) });
      expect(d.staleScrape).toBe(true);
      expect(d.daysSinceLastSuccess).toBe(90);
    });
  });

  describe("zero active postings", () => {
    it("flags an established company with no active postings", () => {
      const d = evaluateStaleness({ ...base, activeJobCount: 0 });
      expect(d.noActiveJobs).toBe(true);
      // Scrape itself is fresh — only the postings signal fires.
      expect(d.staleScrape).toBe(false);
    });

    it("fires both signals together when scrape is stale AND board is empty", () => {
      const d = evaluateStaleness({
        ...base,
        lastSuccessAt: daysAgo(30),
        activeJobCount: 0,
      });
      expect(d.staleScrape).toBe(true);
      expect(d.noActiveJobs).toBe(true);
    });
  });

  describe("sub-brands (parent_company_id set)", () => {
    it("never fires stale_scrape — sub-brands have no scrape task of their own", () => {
      // Simplii's jobs land via CIBC's scrape; "no completed task" is
      // structurally true and meaningless.
      const d = evaluateStaleness({
        ...base,
        isSubBrand: true,
        lastSuccessAt: null,
      });
      expect(d.staleScrape).toBe(false);
    });

    it("still fires no_active_jobs for a sub-brand gone dark (the Simplii pattern)", () => {
      const d = evaluateStaleness({
        ...base,
        isSubBrand: true,
        lastSuccessAt: null,
        activeJobCount: 0,
      });
      expect(d.noActiveJobs).toBe(true);
    });
  });

  describe("onboarding grace", () => {
    it("suppresses both signals for a company added yesterday", () => {
      // A fresh company legitimately has no scrape history yet.
      const d = evaluateStaleness({
        ...base,
        companyCreatedAt: daysAgo(1),
        lastSuccessAt: null,
        activeJobCount: 0,
      });
      expect(d.staleScrape).toBe(false);
      expect(d.noActiveJobs).toBe(false);
    });

    it("grace ends at the threshold — day 7 company is judged normally", () => {
      const d = evaluateStaleness({
        ...base,
        companyCreatedAt: daysAgo(STALE_SCRAPE_THRESHOLD_DAYS),
        lastSuccessAt: null,
        activeJobCount: 0,
      });
      expect(d.staleScrape).toBe(true);
      expect(d.noActiveJobs).toBe(true);
    });

    it("a null created_at gets no grace (judged normally)", () => {
      const d = evaluateStaleness({
        ...base,
        companyCreatedAt: null,
        lastSuccessAt: daysAgo(10),
      });
      expect(d.staleScrape).toBe(true);
    });
  });
});
