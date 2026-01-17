import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CopyButton } from "@/components/templates/CopyButton";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  let query = supabase
    .from("job_templates")
    .select("id, role_category, quality_score, job_postings!job_posting_id(title, description_text, companies(name))")
    .limit(100);

  if (params.category) query = query.eq("role_category", params.category);
  if (params.q) {
    query = query.or(`role_category.ilike.%${params.q}%,notes.ilike.%${params.q}%`);
  }

  const { data: templates } = await query;

  const { data: categories } = await supabase.from("job_templates").select("role_category").not("role_category", "is", null);
  const cats = [...new Set((categories ?? []).map((c) => c.role_category).filter(Boolean))] as string[];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Job Template Library</h1>
      <Card>
        <CardContent className="pt-6">
          <form method="get" className="flex flex-wrap gap-4 mb-4">
            <Input name="q" placeholder="Search…" defaultValue={params.q ?? ""} className="max-w-xs" />
            <select name="category" className="border rounded px-3 py-2" defaultValue={params.category ?? ""}>
              <option value="">All categories</option>
              {cats.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <Button type="submit">Apply</Button>
          </form>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Category</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(templates ?? []).map((t) => {
                const jpRaw = t.job_postings;
                const jp = Array.isArray(jpRaw) ? jpRaw[0] : jpRaw;
                const co = Array.isArray(jp?.companies) ? (jp?.companies as { name?: string }[])[0] : (jp?.companies as { name?: string } | undefined);
                return (
                  <TableRow key={t.id}>
                    <TableCell>{jp?.title ?? "—"}</TableCell>
                    <TableCell>{co?.name ?? "—"}</TableCell>
                    <TableCell>{t.role_category ?? "—"}</TableCell>
                    <TableCell>
                      {jp?.description_text && <CopyButton text={jp.description_text} />}
                      <Link href={`/templates/${encodeURIComponent(t.role_category ?? "other")}`} className="ml-2 text-primary text-sm hover:underline">Browse</Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {(templates ?? []).length === 0 && (
            <p className="py-8 text-center text-muted-foreground">No templates yet. Job templates are created when jobs are categorized.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
