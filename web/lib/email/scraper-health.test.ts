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
  CANARY_DROP_RATIO,
  CANARY_MIN_ROLLING_AVG,
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
