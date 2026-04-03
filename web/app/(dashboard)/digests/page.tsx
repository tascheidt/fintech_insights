import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default async function DigestsPage() {
  const supabase = await createClient();

  // Get the latest digest to show by default
  const { data: latestDigest } = await supabase
    .from("weekly_digests")
    .select("id")
    .order("week_start", { ascending: false })
    .limit(1)
    .single();

  // If we have a digest, redirect to it (show latest content by default)
  if (latestDigest) {
    redirect(`/digests/${latestDigest.id}`);
  }

  // No digests yet - show empty state
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardContent className="py-12">
          <div className="text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Digests Yet</h3>
            <p className="text-muted-foreground">
              Weekly digests are generated every Monday at 6am UTC.
              Check back after the first digest is created.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
