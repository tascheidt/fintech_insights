import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Sparkles, ArrowRight } from "lucide-react";
import type { LatestDigest } from "@/lib/dashboard-queries";

export function WeeklyIntelBanner({ digest }: { digest: LatestDigest | null }) {
  if (!digest || !digest.globalSummary) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No weekly digest available yet. Check back after the first digest is
        generated.
      </div>
    );
  }

  const { globalSummary } = digest;
  const relativeTime = formatDistanceToNow(new Date(digest.generatedAt), {
    addSuffix: true,
  });

  return (
    <div className="rounded-lg border bg-primary/5 p-5">
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 space-y-1">
          <p className="font-semibold text-sm leading-snug">
            {globalSummary.headline || "Weekly Intelligence Summary"}
          </p>
          {globalSummary.key_insight && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {globalSummary.key_insight}
            </p>
          )}
          <div className="flex items-center gap-3 pt-1">
            <Link
              href={`/digests/${digest.id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Read full digest <ArrowRight className="h-3 w-3" />
            </Link>
            <span className="text-xs text-muted-foreground">
              {relativeTime}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
