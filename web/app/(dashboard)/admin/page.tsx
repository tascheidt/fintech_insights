import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SystemStats } from "@/components/admin/SystemStats";
import { JobScheduleSettings } from "@/components/admin/JobScheduleSettings";
import { CronLogsTable } from "@/components/admin/CronLogsTable";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/");

  // Fetch users for user management section
  const { data: users } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  // Fetch current settings
  const { data: settingsData } = await supabase
    .from("system_settings")
    .select("*");

  // Transform settings to key-value map
  const settings = (settingsData ?? []).reduce((acc, s) => {
    acc[s.setting_key] = {
      value: s.setting_value,
      description: s.description,
      updated_at: s.updated_at,
    };
    return acc;
  }, {} as Record<string, { value: unknown; description: string; updated_at: string }>);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Manage system settings, monitor job executions, and configure schedules
        </p>
      </div>

      {/* System Stats Overview */}
      <SystemStats />

      {/* Main Content Tabs */}
      <Tabs defaultValue="schedules" className="space-y-4">
        <TabsList>
          <TabsTrigger value="schedules">Job Schedules</TabsTrigger>
          <TabsTrigger value="history">Execution History</TabsTrigger>
          <TabsTrigger value="users">User Management</TabsTrigger>
        </TabsList>

        {/* Job Schedules Tab */}
        <TabsContent value="schedules" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Schedule Settings */}
            <div className="lg:col-span-2">
              <JobScheduleSettings initialSettings={settings} />
            </div>

            {/* Schedule Info Sidebar */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <h3 className="font-semibold">About Job Schedules</h3>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-3">
                  <p>
                    Jobs are scheduled using Vercel Cron. The actual execution times are defined in 
                    <code className="mx-1 px-1 py-0.5 bg-muted rounded text-xs">vercel.json</code>.
                  </p>
                  <p>
                    Settings saved here are stored for reference and can be used to configure 
                    job behavior. To change the actual schedule, update the cron expressions in 
                    your Vercel configuration.
                  </p>
                  <div className="pt-3 border-t space-y-2">
                    <p className="font-medium text-foreground">Current Schedules:</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        <span>Collection: Daily at 6:00 AM UTC</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        <span>Reports: Monday at 8:00 AM UTC</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h3 className="font-semibold">Cron Expression Reference</h3>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <div className="font-mono text-xs bg-muted p-3 rounded space-y-1">
                    <p># Daily at 6 AM UTC</p>
                    <p className="text-primary">0 6 * * *</p>
                    <p className="mt-2"># Every Monday at 8 AM UTC</p>
                    <p className="text-primary">0 8 * * 1</p>
                    <p className="mt-2"># Every 6 hours</p>
                    <p className="text-primary">0 */6 * * *</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Execution History Tab */}
        <TabsContent value="history">
          <CronLogsTable />
        </TabsContent>

        {/* User Management Tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Users</h3>
              <CardDescription>
                Registered users and their roles
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(users ?? []).length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No users found</p>
              ) : (
                <div className="divide-y">
                  {(users ?? []).map((u) => (
                    <div key={u.id} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{u.email}</p>
                        <p className="text-sm text-muted-foreground">
                          {u.full_name ?? "No name set"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            u.role === "admin"
                              ? "bg-purple-500/10 text-purple-600"
                              : u.role === "editor"
                              ? "bg-blue-500/10 text-blue-600"
                              : "bg-gray-500/10 text-gray-600"
                          }`}
                        >
                          {u.role}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
