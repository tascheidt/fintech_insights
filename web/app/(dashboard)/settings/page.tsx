import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("email, full_name, role").eq("id", user?.id ?? "").single();

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
    </div>
  );
}
