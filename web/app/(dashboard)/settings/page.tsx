import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { EmailPreferences } from "@/components/settings/EmailPreferences";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, role, email_preferences")
    .eq("id", user?.id ?? "")
    .single();

  // Get current email preferences (default to true if null)
  const weeklyDigestEnabled = profile?.email_preferences?.weekly_digest ?? true;

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-3xl font-bold">Settings</h1>
      
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Profile</h2>
        </CardHeader>
        <CardContent className="space-y-2">
          <p><span className="text-muted-foreground">Email:</span> {profile?.email ?? user?.email ?? "—"}</p>
          <p><span className="text-muted-foreground">Name:</span> {profile?.full_name ?? "—"}</p>
          <p><span className="text-muted-foreground">Role:</span> {profile?.role ?? "—"}</p>
        </CardContent>
      </Card>

      <EmailPreferences initialWeeklyDigest={weeklyDigestEnabled === true || weeklyDigestEnabled === "true"} />
    </div>
  );
}
