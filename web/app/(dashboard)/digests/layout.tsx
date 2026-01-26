import { createClient } from "@/lib/supabase/server";
import { DigestSidebar } from "@/components/digests/DigestSidebar";

export default async function DigestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Fetch all digests for the sidebar
  const { data: digests } = await supabase
    .from("weekly_digests")
    .select("id, week_start, week_end, generated_at, total_jobs, global_summary")
    .order("week_start", { ascending: false })
    .limit(100);

  const digestsList = (digests || []).map(d => ({
    id: d.id,
    week_start: d.week_start,
    week_end: d.week_end,
    generated_at: d.generated_at,
    total_jobs: d.total_jobs,
    global_summary: d.global_summary as { headline?: string; key_insight?: string } | null,
  }));

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <aside className="w-72 border-r bg-background flex-shrink-0 hidden lg:block">
        <DigestSidebar digests={digestsList} />
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
