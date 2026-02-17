import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JobsTabContent } from "@/components/admin/JobsTabContent";
import { FeedbackReviewTable } from "@/components/admin/FeedbackReviewTable";
import { parseCronExpression } from "@/lib/utils/cron";
import { readFileSync } from "fs";
import { join } from "path";

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

  // Read vercel.json to get cron schedules
  // process.cwd() is already the web directory when running Next.js
  const vercelConfigPath = join(process.cwd(), "vercel.json");
  const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, "utf-8"));
  
  const schedules = vercelConfig.crons.map((cron: { path: string; schedule: string }) => ({
    path: cron.path,
    schedule: cron.schedule,
    name: cron.path === "/api/cron/collect" ? "Collection" : "Reports",
    readable: parseCronExpression(cron.schedule),
  }));

  const collectionSchedule = schedules.find((s: { path: string }) => s.path === "/api/cron/collect");
  const reportSchedule = schedules.find((s: { path: string }) => s.path === "/api/cron/report");

  // Fetch last run information
  const { data: lastCollect } = await supabase
    .from("job_runs")
    .select("completed_at, total_new_jobs")
    .eq("job_type", "collect")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: lastReport } = await supabase
    .from("job_runs")
    .select("completed_at")
    .eq("job_type", "report")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Monitor job executions and manage users
        </p>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="jobs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
        </TabsList>

        {/* Jobs Tab */}
        <TabsContent value="jobs">
          <JobsTabContent
            collectionSchedule={collectionSchedule}
            reportSchedule={reportSchedule}
            lastCollect={lastCollect}
            lastReport={lastReport}
          />
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

        {/* Feedback Tab */}
        <TabsContent value="feedback">
          <FeedbackReviewTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
