import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; category?: string; since?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  let query = supabase
    .from("strategic_insights")
    .select("id, category, insight_summary, run_date, confidence, job_postings!inner(title, companies!inner(name, is_active))")
    .eq("job_postings.companies.is_active", true)
    .order("run_date", { ascending: false })
    .limit(100);

  if (params.category) query = query.eq("category", params.category);
  if (params.since) query = query.gte("run_date", params.since);

  if (params.company) {
    const { data: company } = await supabase.from("companies").select("id").eq("slug", params.company).single();
    if (company) {
      const { data: jobIds } = await supabase.from("job_postings").select("id").eq("company_id", company.id);
      const ids = (jobIds ?? []).map((j) => j.id);
      if (ids.length > 0) query = query.in("job_posting_id", ids);
    }
  }

  const { data: insights } = await query;

  const { data: companies } = await supabase.from("companies").select("slug, name").eq("is_active", true).order("name");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Strategic Insights</h1>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Filters</h2>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap gap-4" method="get">
            <div>
              <label className="text-sm text-muted-foreground">Company</label>
              <select name="company" className="ml-2 border rounded px-2 py-1" defaultValue={params.company}>
                <option value="">All</option>
                {(companies ?? []).map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Category</label>
              <select name="category" className="ml-2 border rounded px-2 py-1" defaultValue={params.category}>
                <option value="">All</option>
                <option value="expansion">Expansion</option>
                <option value="new-product">New Product</option>
                <option value="technology">Technology</option>
                <option value="operational">Operational</option>
                <option value="compliance">Compliance</option>
                <option value="customer">Customer</option>
                <option value="data">Data</option>
                <option value="marketing">Marketing</option>
                <option value="leadership">Leadership</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Since</label>
              <Input name="since" type="date" className="w-40 ml-2" defaultValue={params.since ?? ""} />
            </div>
            <Button type="submit">Apply</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Job Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(insights ?? []).map((i) => {
                const raw = (i as { job_postings?: unknown }).job_postings;
                const jp = (Array.isArray(raw) ? raw[0] : raw) as { title?: string; companies?: { name?: string } } | null | undefined;
                return (
                <TableRow key={(i as { id: string }).id}>
                  <TableCell>{jp?.companies?.name ?? "—"}</TableCell>
                  <TableCell>{jp?.title ?? "—"}</TableCell>
                  <TableCell>{(i as { category?: string | null }).category ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">{(i as { insight_summary?: string | null }).insight_summary ?? "—"}</TableCell>
                  <TableCell>{(i as { run_date?: string }).run_date ? format(new Date((i as { run_date: string }).run_date), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell>
                    <Link href={`/insights/${(i as { id: string }).id}`} className="text-primary hover:underline">View</Link>
                  </TableCell>
                </TableRow>
              );})}
            </TableBody>
          </Table>
          {(insights ?? []).length === 0 && (
            <p className="py-8 text-center text-muted-foreground">No insights found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
