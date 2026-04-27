/**
 * SignalsTimeline — chronological list of strategic signals.
 *
 * Visual contract (design system):
 * - Vertical variant: 1px border-l rail in `border-border`, 9×9 alignment dot
 *   left-anchored, eyebrow in mono, body in regular.
 * - Responsive variant: horizontal scroll on wide screens, falls back to vertical.
 *
 * Used by `/companies/[slug]` (vertical) and optionally `/digests/[id]` (responsive).
 */

import { cn } from "@/lib/utils";

export type TimelineEvent = {
  when: string;
  title: string;
  body?: string;
  alignment?: "strong" | "moderate" | "weak" | "contra";
};

const DOT: Record<NonNullable<TimelineEvent["alignment"]>, string> = {
  strong: "bg-growth-500",
  moderate: "bg-accent",
  weak: "bg-muted-foreground",
  contra: "bg-highlight",
};

export function SignalsTimeline({
  events,
  variant = "responsive",
  className,
}: {
  events: TimelineEvent[];
  variant?: "vertical" | "responsive";
  className?: string;
}) {
  if (events.length === 0) return null;

  if (variant === "responsive") {
    return (
      <ol
        className={cn(
          "flex flex-col gap-6 md:flex-row md:gap-8 md:overflow-x-auto md:pb-2",
          className
        )}
      >
        {events.map((e, i) => (
          <li
            key={i}
            className="md:min-w-[260px] md:max-w-[260px] md:flex-shrink-0"
          >
            <SignalRow event={e} />
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol
      className={cn("relative ml-2 border-l border-border", className)}
    >
      {events.map((e, i) => {
        const dot = e.alignment ? DOT[e.alignment] : DOT.weak;
        return (
          <li key={i} className="relative pl-6 pb-6">
            <span
              aria-hidden
              className={cn(
                "absolute -left-[5px] top-1 h-[9px] w-[9px] rounded-full ring-2 ring-background",
                dot
              )}
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-1">
              {e.when}
            </p>
            <p className="text-sm font-medium text-foreground leading-snug">
              {e.title}
            </p>
            {e.body && (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {e.body}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function SignalRow({ event }: { event: TimelineEvent }) {
  const dot = event.alignment ? DOT[event.alignment] : DOT.weak;
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className={cn("mt-1 h-[9px] w-[9px] rounded-full shrink-0", dot)}
      />
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-1">
          {event.when}
        </p>
        <p className="text-sm font-medium text-foreground leading-snug">
          {event.title}
        </p>
        {event.body && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {event.body}
          </p>
        )}
      </div>
    </div>
  );
}
