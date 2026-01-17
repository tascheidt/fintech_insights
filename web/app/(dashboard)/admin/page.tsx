import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const { data: users } = await supabase.from("profiles").select("id, email, full_name, role, created_at").limit(50);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin</h1>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Users</h2>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {(users ?? []).map((u: { email?: string; full_name?: string; role?: string }) => (
              <li key={u.email}>{u.email} – {u.full_name ?? "—"} ({u.role})</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
