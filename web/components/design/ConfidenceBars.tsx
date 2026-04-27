/**
 * ConfidenceBars — 5-segment indicator showing editorial confidence in a
 * Strategic Bet (1 = barely a hunch, 5 = high conviction).
 *
 * Used on the Bet cards in DirectionA_v2 (company drill-down).
 */

import { cn } from "@/lib/utils";

export type Confidence = 1 | 2 | 3 | 4 | 5;

export interface ConfidenceBarsProps {
  value: Confidence;
  className?: string;
}

export function ConfidenceBars({ value, className }: ConfidenceBarsProps) {
  return (
    <span
      aria-label={`Confidence ${value} of 5`}
      className={cn("inline-flex items-center gap-[2px]", className)}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "block rounded-[1px]",
            i <= value ? "bg-primary" : "bg-muted"
          )}
          style={{ width: 5, height: 9 }}
        />
      ))}
    </span>
  );
}
