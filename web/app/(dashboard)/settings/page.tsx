/**
 * Settings — tabbed structure per design system.
 *
 * Tabs: Notifications · Sources · Account · Team
 * - Notifications: weekly digest toggle, signal alerts (placeholder), digest day.
 * - Sources: ATS source health table (companies + last polled status).
 * - Account: profile fields (read-only for now).
 * - Team: stub.
 */

import { createClient } from "@/lib/supabase/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailPreferences } from "@/components/settings/EmailPreferences";
import { FeedbackHistory } from "@/components/feedback/FeedbackHistory";
import { EmptyState } from "@/components/feedback/EmptyState";
import { AlertTriangle, Users } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, role, email_preferences")
    .eq("id", user?.id ?? "")
    .single();

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, ats_type, last_scraped_at, is_active")
    .eq("is_active", true)
    .order("name");

  const weeklyDigestEnabled = profile?.email_preferences?.weekly_digest ?? true;

  type SourceRow = {
    id: string;
    name: string;
    ats_type: string | null;
    last_scraped_at: string | null;
  };

  const sources: SourceRow[] = (companies ?? []).map((c: SourceRow) => ({
    id: c.id,
    name: c.name,
    ats_type: c.ats_type,
    last_scraped_at: c.last_scraped_at,
  }));

  // Single timestamp captured per request (server component) — passed down so
  // the SourcesPanel renders deterministically against the same `now`. The
  // react-hooks/purity rule is meant for client renders; in a Next.js async
  // server component, this body runs once per request.
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <h1 className="font-display font-semibold text-[28px] tracking-[-0.018em] leading-[1.12] text-foreground">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your notifications, source health, and account.
        </p>
      </div>

      <Tabs defaultValue="notifications" className="space-y-6">
        <TabsList>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>

        <TabsContent value="notifications" className="space-y-6">
          <EmailPreferences initialWeeklyDigest={weeklyDigestEnabled} />
        </TabsContent>

        <TabsContent value="sources" className="space-y-4">
          <SourcesPanel sources={sources} now={renderedAt} />
        </TabsContent>

        <TabsContent value="account" className="space-y-6">
          <div className="rounded-[10px] border border-border bg-card px-5 py-5 space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-primary">
              Profile
            </p>
            <dl className="space-y-2 text-sm">
              <Row label="Email" value={profile?.email ?? user?.email ?? "—"} />
              <Row label="Name" value={profile?.full_name ?? "—"} />
              <Row label="Role" value={profile?.role ?? "—"} />
            </dl>
          </div>
          <FeedbackHistory />
        </TabsContent>

        <TabsContent value="team">
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="Team management coming soon"
            body="Invite teammates, manage roles, and share digest delivery preferences. We're rolling this out next."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

const STALE_MS = 1000 * 60 * 60 * 30; // 30h

function SourcesPanel({
  sources,
  now,
}: {
  sources: Array<{
    id: string;
    name: string;
    ats_type: string | null;
    last_scraped_at: string | null;
  }>;
  now: number;
}) {
  if (sources.length === 0) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-5 w-5" />}
        kind="warn"
        title="No sources configured"
        body="Add a company to start tracking ATS sources."
        primaryAction={{ label: "Add company", href: "/companies/add" }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Company
            </th>
            <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              ATS
            </th>
            <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Last polled
            </th>
            <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const polled = s.last_scraped_at ? new Date(s.last_scraped_at) : null;
            const ageMs = polled ? now - polled.getTime() : Infinity;
            const status: "ok" | "warn" | "pending" = !polled
              ? "pending"
              : ageMs > STALE_MS
                ? "warn"
                : "ok";
            return (
              <tr key={s.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {s.ats_type ?? "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground tabular-nums">
                  {polled
                    ? `${formatDistanceToNow(polled, { addSuffix: true })} (${format(polled, "MMM d")})`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusChip status={status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusChip({ status }: { status: "ok" | "warn" | "pending" }) {
  const map = {
    ok: { label: "OK", classes: "bg-primary-soft text-primary-soft-foreground" },
    warn: { label: "Stale", classes: "bg-accent-soft text-accent-soft-foreground" },
    pending: { label: "Pending", classes: "bg-muted text-muted-foreground" },
  } as const;
  const { label, classes } = map[status];
  return (
    <span
      className={`inline-flex items-center text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${classes}`}
    >
      {label}
    </span>
  );
}
