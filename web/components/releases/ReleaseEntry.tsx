import type { Release } from "@/lib/releases";
import { ChangeBadge } from "./ChangeBadge";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function ReleaseEntry({
  release,
  isLatest,
}: {
  release: Release;
  isLatest: boolean;
}) {
  return (
    <div className="py-6">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">v{release.version}</h2>
        {isLatest && (
          <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-background">
            Latest
          </span>
        )}
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {formatDate(release.date)}
      </p>
      <ul className="mt-4 space-y-2">
        {release.changes.map((change, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <ChangeBadge type={change.type} />
            <span>{change.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
