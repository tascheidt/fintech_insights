import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  let query = supabase
    .from("job_postings")
    .select("id, title, department, location, is_active, first_seen_date, companies(name, slug)")
    .eq("is_active", true)
    .order("first_seen_date", { ascending: false })
    .limit(200);

  if (params.q) {
    query = query.or(`title.ilike.%${params.q}%,description_text.ilike.%${params.q}%`);
  }

  const { data: jobs } = await query;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Job Postings</h1>
      <Card>
        <CardContent className="pt-6">
          <form method="get" className="flex gap-2 mb-4">
            <Input name="q" placeholder="Search by title or description…" defaultValue={params.q ?? ""} className="max-w-sm" />
            <Button type="submit">Search</Button>
          </form>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>First Seen</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(jobs ?? []).map((j) => {
                const c = (Array.isArray((j as { companies?: unknown }).companies) ? (j as { companies: unknown[] }).companies[0] : (j as { companies?: { name?: string; slug?: string } }).companies) as { name?: string; slug?: string } | null | undefined;
                return (
                <TableRow key={(j as { id: string }).id}>
                  <TableCell>{(j as { title: string }).title}</TableCell>
                  <TableCell>
                    <Link href={`/companies/${c?.slug ?? ""}`} className="hover:underline">
                      {c?.name ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{(j as { department?: string }).department ?? "—"}</TableCell>
                  <TableCell>{(j as { location?: string }).location ?? "—"}</TableCell>
                  <TableCell>{(j as { first_seen_date?: string }).first_seen_date ? format(new Date((j as { first_seen_date: string }).first_seen_date), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell>
                    <Link href={`/jobs/${(j as { id: string }).id}`} className="text-primary text-sm hover:underline">View</Link>
                  </TableCell>
                </TableRow>
              );})}
            </TableBody>
          </Table>
          {(jobs ?? []).length === 0 && <p className="py-8 text-center text-muted-foreground">No jobs found.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
