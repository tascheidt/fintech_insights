/**
 * Wave 2 design primitives — small, single-purpose, fully token-driven
 * components shared across the v2 page rebuilds (Streams J/K/L).
 *
 * Import from this barrel to keep page-level imports tidy:
 *
 *   import { Sparkline, PivotChip, FunctionDot } from "@/components/design";
 */

export { Sparkline } from "./Sparkline";
export type { SparklineKind, SparklineProps } from "./Sparkline";

export { PivotChip } from "./PivotChip";
export type { PivotKind, PivotChipProps } from "./PivotChip";

export { CoverageStrip } from "./CoverageStrip";
export type { CoverageStripProps } from "./CoverageStrip";

export { SignalTag } from "./SignalTag";
export type { SignalTagProps } from "./SignalTag";

export { FunctionDot } from "./FunctionDot";
export type { FunctionDotProps } from "./FunctionDot";

export { ConfidenceBars } from "./ConfidenceBars";
export type { Confidence, ConfidenceBarsProps } from "./ConfidenceBars";

export { MonogramAvatar } from "./MonogramAvatar";
export type { MonogramSize, MonogramAvatarProps } from "./MonogramAvatar";
