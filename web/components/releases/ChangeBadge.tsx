import type { Change } from "@/lib/releases";

const badgeStyles: Record<Change["type"], string> = {
  feature: "bg-accent-soft text-accent-soft-foreground",
  fix: "bg-highlight-soft text-highlight-soft-foreground",
  improvement: "bg-primary-soft text-primary-soft-foreground",
};

const badgeLabels: Record<Change["type"], string> = {
  feature: "Feature",
  fix: "Fix",
  improvement: "Improvement",
};

export function ChangeBadge({ type }: { type: Change["type"] }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium leading-none ${badgeStyles[type]}`}
    >
      {badgeLabels[type]}
    </span>
  );
}
