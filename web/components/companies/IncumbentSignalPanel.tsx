/**
 * IncumbentSignalPanel — the "Senior hiring signal" card on an incumbent
 * bank's company-detail page (Phase 2 spec §Surface 5 §3).
 *
 * Renders the curated senior-hiring slice (`getIncumbentBets`) for one bank
 * as count-first role rows, plus one honest summary line pairing the raw
 * total volume with the senior-signal count. This is the only place a raw
 * bank volume number sits next to the signal count.
 *
 * Pure presentational — the page server component fetches the data.
 */
import { Landmark } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { IncumbentBetCompany } from "@/lib/dashboard-queries";

export interface IncumbentSignalPanelProps {
  bet: IncumbentBetCompany | null;
}

export function IncumbentSignalPanel({ bet }: IncumbentSignalPanelProps) {
  const roles = bet?.roles ?? [];
  const totalActive = bet?.totalOpenJobs ?? 0;
  const seniorCount = bet?.signalRoleCount ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Landmark
            className="h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          <h2 className="font-semibold text-foreground">
            Senior hiring signal
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Staff+ roles in AI/ML, Data &amp; Risk-AI · last 30 days
        </p>
      </CardHeader>
      <CardContent>
        {roles.length === 0 ? (
          // The user navigated here deliberately — render an in-place empty
          // state, not absence (spec §Surface 5 edge cases).
          <p className="text-sm text-muted-foreground">
            No senior hires recorded in the last 30 days.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {roles.map((role, i) => (
              <li
                key={`${role.title}-${i}`}
                className="flex items-baseline gap-2.5 py-1"
              >
                {/* Count first — the count is the signal, never a volume total. */}
                <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
                  {role.count}
                </span>
                <div className="min-w-0">
                  <span className="text-[13px] text-foreground">
                    {role.title}
                  </span>
                  {role.location && (
                    <span className="block text-xs text-muted-foreground">
                      {role.location}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* The single honest scale-vs-signal line. */}
        <p className="mt-4 border-t border-border pt-3 text-xs tabular-nums text-muted-foreground">
          {totalActive.toLocaleString()} total open{" "}
          {totalActive === 1 ? "posting" : "postings"} · {seniorCount} senior
          AI/ML, Data &amp; Risk {seniorCount === 1 ? "role" : "roles"}
        </p>
      </CardContent>
    </Card>
  );
}
