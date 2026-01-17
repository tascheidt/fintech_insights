import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/templates/CopyButton";

export default async function TemplatesCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const decoded = decodeURIComponent(category);
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("job_templates")
    .select("id, role_category, quality_score, notes, job_postings!job_posting_id(id, title, description_text, companies(name))")
    .eq("role_category", decoded)
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/templates">← Templates</Link>
        </Button>
      </div>
      <h1 className="text-2xl font-bold">Templates: {decoded}</h1>
      <div className="grid gap-4">
        {(templates ?? []).map((t) => {
          const jpRaw = t.job_postings;
          const jp = Array.isArray(jpRaw) ? jpRaw[0] : jpRaw;
          const co = Array.isArray(jp?.companies) ? (jp?.companies as { name?: string }[])[0] : (jp?.companies as { name?: string } | undefined);
          return (
            <Card key={t.id}>
              <CardHeader>
                <h2 className="font-semibold">{jp?.title ?? "—"}</h2>
                <p className="text-sm text-muted-foreground">{co?.name ?? "—"}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {jp?.description_text && (
                  <>
                    <div className="prose prose-sm max-h-48 overflow-y-auto">
                      <pre className="whitespace-pre-wrap font-sans text-sm">{jp.description_text.slice(0, 2000)}{jp.description_text.length > 2000 ? "…" : ""}</pre>
                    </div>
                    <CopyButton text={jp.description_text} />
                  </>
                )}
                <Link href={`/jobs/${jp?.id}`} className="text-primary text-sm hover:underline">View full job</Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {(templates ?? []).length === 0 && <p className="py-8 text-center text-muted-foreground">No templates in this category.</p>}
    </div>
  );
}
