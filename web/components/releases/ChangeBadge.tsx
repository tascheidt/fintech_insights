import type { Change } from "@/lib/releases";

const badgeStyles: Record<Change["type"], string> = {
  feature: "bg-emerald-50 text-emerald-700",
  fix: "bg-amber-50 text-amber-700",
  improvement: "bg-blue-50 text-blue-700",
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
