/**
 * Sparkline — tiny inline trend chart used on Companies index rows and on
 * Strategic Bet cards.
 *
 * Renders a polyline with a soft fill underneath and a small dot on the
 * trailing point. Color is driven by a `kind` prop that maps to a CSS
 * variable so we never hardcode hex literals here.
 *
 * Reference: `CIv2_Spark` in /tmp/design-package-v2/.../CompaniesIndex_v2.jsx
 */

import { cn } from "@/lib/utils";

export type SparklineKind = "new" | "accel" | "quiet" | "cont";

const COLOR_VAR: Record<SparklineKind, string> = {
  new: "var(--sunset-500)",
  // sun-700 reads as warm yellow on light bg without going neon
  accel: "var(--sun-700)",
  quiet: "var(--muted-foreground)",
  cont: "var(--primary)",
};

export interface SparklineProps {
  data: number[];
  kind?: SparklineKind;
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({
  data,
  kind = "cont",
  width = 96,
  height = 26,
  className,
}: SparklineProps) {
  const safe = data && data.length > 0 ? data : [0, 0];
  const pad = 2;
  const max = Math.max(...safe, 1);
  const min = Math.min(...safe, 0);
  const range = Math.max(max - min, 1);
  const step = (width - pad * 2) / Math.max(safe.length - 1, 1);

  const pts = safe
    .map(
      (v, i) =>
        `${pad + i * step},${(
          height -
          pad -
          ((v - min) / range) * (height - pad * 2)
        ).toFixed(2)}`
    )
    .join(" ");

  const lastX = (pad + (safe.length - 1) * step).toFixed(2);
  const lastY = (
    height -
    pad -
    ((safe[safe.length - 1] - min) / range) * (height - pad * 2)
  ).toFixed(2);

  const color = COLOR_VAR[kind];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("block shrink-0", className)}
      aria-hidden
    >
      <polyline
        points={`${pad},${height - pad} ${pts} ${width - pad},${height - pad}`}
        fill={color}
        fillOpacity="0.13"
        stroke="none"
      />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r="2" fill={color} />
    </svg>
  );
}
