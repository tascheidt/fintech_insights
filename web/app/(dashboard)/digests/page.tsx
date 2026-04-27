import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Newspaper } from "lucide-react";
import { EmptyState } from "@/components/feedback/EmptyState";

export default async function DigestsPage() {
  const supabase = await createClient();

  const { data: latestDigest } = await supabase
    .from("weekly_digests")
    .select("id")
    .order("week_start", { ascending: false })
    .limit(1)
    .single();

  if (latestDigest) {
    redirect(`/digests/${latestDigest.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl py-12">
      <EmptyState
        icon={<Newspaper className="h-5 w-5" />}
        title="First digest goes out next Monday"
        body="Weekly digests are generated every Monday at 6am UTC. Once published, they will appear here and in the archive."
        primaryAction={{ label: "View archive", href: "/digests/archive" }}
      />
    </div>
  );
}
