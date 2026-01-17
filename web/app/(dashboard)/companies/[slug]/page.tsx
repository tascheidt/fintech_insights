import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default async function CompanyDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: company, error } = await supabase.from("companies").select("*").eq("slug", slug).single();
  if (error || !company) notFound();

  const { data: jobs } = await supabase
    .from("job_postings")
    .select("id, title, department, location, is_active, first_seen_date")
    .eq("company_id", company.id)
    .order("first_seen_date", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/companies">← Companies</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold">{company.name}</h1>
          <p className="text-muted-foreground">{company.country} · {company.ats_type} · {company.track_for_strategy ? "Strategic" : "Templates only"}</p>
          {company.careers_url && (
            <a href={company.careers_url} target="_blank" rel="noreferrer" className="text-primary text-sm hover:underline">
              Careers page
            </a>
          )}
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Job Postings</h2>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>First Seen</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(jobs ?? []).map((j) => (
                <TableRow key={j.id}>
                  <TableCell>{j.title}</TableCell>
                  <TableCell>{j.department ?? "—"}</TableCell>
                  <TableCell>{j.location ?? "—"}</TableCell>
                  <TableCell>{j.first_seen_date ? format(new Date(j.first_seen_date), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell>
                    <Link href={`/jobs/${j.id}`} className="text-primary text-sm hover:underline">View</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(jobs ?? []).length === 0 && <p className="py-4 text-center text-muted-foreground">No jobs yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
