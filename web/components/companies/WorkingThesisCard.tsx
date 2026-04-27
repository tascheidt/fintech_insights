/**
 * WorkingThesisCard — the "tb-thesis" pattern from DirectionA_v2.
 *
 * A surface-tone card with a 4px gradient strip running down the left
 * (pacific → sunset → sun) and a Fraunces 24px italic-quoted thesis,
 * a sand-700 sub-line, and a top-bordered metrics row.
 *
 * When `thesis` is empty, renders a minimal editorial empty state instead
 * pointing the editor at the settings drawer.
 *
 * Reference: `dirA-thesis*` rules in
 * /tmp/design-package-v2/rethink-jobs-and-companies-pages/project/extra-styles.css
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface ThesisMetric {
  label: string;
  value: string;
}

export interface WorkingThesisCardProps {
  thesis: string | null | undefined;
  thesisSub: string | null | undefined;
  updatedAgo: string | null | undefined;
  metrics: ThesisMetric[];
  editHref: string;
}

export function WorkingThesisCard({
  thesis,
  thesisSub,
  updatedAgo,
  metrics,
  editHref,
}: WorkingThesisCardProps) {
  if (!thesis || thesis.trim() === "") {
    return (
      <div className="relative my-5 overflow-hidden rounded-[14px] border border-border bg-card px-8 py-7">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1"
          style={{
            background:
              "linear-gradient(180deg, var(--pacific-500), var(--sunset-500), var(--sun-500))",
          }}
        />
        <div className="font-mono text-[11px] uppercase tracking-[0.09em] text-muted-foreground">
          Working thesis · not set
        </div>
        <p className="mt-2.5 max-w-[56ch] font-display text-[18px] leading-[1.4] text-foreground/80">
          No working thesis yet. Add one to start tracking strategy
          <Link
            href={editHref}
            className="ml-2 inline-flex items-center gap-1 text-primary hover:underline"
          >
            <ArrowRight className="h-4 w-4" />
          </Link>
        </p>
      </div>
    );
  }

  const eyebrowSuffix = updatedAgo ? ` · UPDATED ${updatedAgo} AGO` : "";

  return (
    <div className="relative my-5 overflow-hidden rounded-[14px] border border-border bg-card px-8 py-7">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{
          background:
            "linear-gradient(180deg, var(--pacific-500), var(--sunset-500), var(--sun-500))",
        }}
      />
      <div className="font-mono text-[11px] uppercase tracking-[0.09em] text-muted-foreground">
        Working thesis{eyebrowSuffix}
      </div>
      <p
        className="mt-2.5 mb-3.5 max-w-[56ch] font-display font-semibold italic text-foreground"
        style={{
          fontSize: 24,
          lineHeight: 1.3,
          letterSpacing: "-0.015em",
          textWrap: "pretty",
        }}
      >
        &ldquo;{thesis}&rdquo;
      </p>
      {thesisSub && (
        <p
          className="mb-4 max-w-[70ch] text-[13.5px] leading-[1.55] text-foreground/70"
        >
          {thesisSub}
        </p>
      )}
      {metrics.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-7 gap-y-3 border-t border-border pt-4">
          {metrics.map((m) => (
            <div key={m.label}>
              <div className="font-sans text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                {m.label}
              </div>
              <div
                className="mt-1.5 font-sans font-bold tabular-nums text-foreground"
                style={{
                  fontSize: 22,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                }}
              >
                {m.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
