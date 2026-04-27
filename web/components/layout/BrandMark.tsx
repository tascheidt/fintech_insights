/**
 * BrandMark — the canonical Talent Brief icon mark, rendered inline.
 *
 * Identical to `web/public/icon-mark.svg` and the design system project's
 * `assets/icon-mark.svg`: a warm sand square with a yellow sun and the
 * coast-gradient wave below the horizon.
 *
 * Why inline (not <Image src="/icon-mark.svg">)? Next.js's image optimizer
 * resizes the SVG and the small (22–28px) display size loses the sun + wave
 * detail, leaving a teal blob in the nav. Inline avoids that.
 *
 * Default render size is 28px so the sun and wave both read clearly. Pass
 * `size` to override for marketing/login surfaces that want the full 32px.
 *
 * Color values are intentionally raw oklch() — a brand mark must NOT shift
 * with theme. The lint rule is disabled per-file for this reason; the
 * canonical mark in the design system uses identical literals.
 */
/* eslint-disable design-system/no-raw-color */

export function BrandMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // Stable id so multiple instances on the same page don't collide.
  const gradientId = `tb-coast-${size}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="oklch(0.405 0.115 244)" />
          <stop offset="55%" stopColor="oklch(0.575 0.150 236)" />
          <stop offset="100%" stopColor="oklch(0.700 0.185 32)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="oklch(0.990 0.006 75)" />
      <circle cx="16" cy="13" r="5" fill="oklch(0.830 0.170 84)" />
      <path
        d="M 4 21 Q 10 17, 16 21 T 28 21 V 27 H 4 Z"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}
