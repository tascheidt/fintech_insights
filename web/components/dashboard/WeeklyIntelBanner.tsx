/**
 * WeeklyIntelBanner — the digest "editorial moment" above the fold.
 *
 * Visual contract (canonical `DigestBanner.jsx` + `styles.css`):
 * - Full-bleed coast gradient background (deep Pacific → coral → amber).
 * - White text across the surface — the gradient runs dark on the left.
 * - Mono eyebrow at 11px, tracked +0.08em, opacity .9.
 * - Fraunces 26px headline, -0.012em tracking, max-width 720px.
 * - Ghost CTA: white border on transparent bg (NEVER primary fill — that
 *   would steamroll the editorial moment).
 * - Mono meta row at 11.5px, opacity .85.
 */

import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";
import type { LatestDigest } from "@/lib/dashboard-queries";

export function WeeklyIntelBanner({ digest }: { digest: LatestDigest | null }) {
  if (!digest || !digest.globalSummary) {
    return (
      <div className="rounded-[14px] border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No weekly digest available yet. Check back after the first digest is generated.
      </div>
    );
  }

  const { globalSummary } = digest;
  const generatedAt = new Date(digest.generatedAt);

  return (
    <section
      className="relative overflow-hidden rounded-[14px] px-6 py-6 sm:px-8 sm:py-7 shadow-sm"
      style={{ background: "var(--gradient-coast)" }}
    >
      {/* Soft top-right glow per canonical styles.css */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--digest-banner-glow)" }}
      />
      <div className="relative">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/90 mb-[10px]">
          Weekly digest · {format(generatedAt, "MMM d, yyyy")}
        </p>

        <h2 className="font-display font-semibold text-[26px] tracking-[-0.012em] leading-[1.18] max-w-[720px] text-white">
          {globalSummary.headline || "Weekly intelligence summary"}
        </h2>

        {globalSummary.key_insight && (
          <p className="mt-2 max-w-[720px] text-sm leading-[1.55] text-white/90">
            {globalSummary.key_insight}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={`/digests/${digest.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/40 bg-transparent px-3.5 text-xs font-medium text-white transition-colors hover:bg-white/10"
          >
            Read full digest <ArrowRight className="h-3 w-3" />
          </Link>
          <span className="font-mono text-[11.5px] tracking-[0.02em] text-white/85 tabular-nums">
            {format(generatedAt, "MMM d, yyyy")}
          </span>
        </div>
      </div>
    </section>
  );
}
