import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const canEdit = ["editor", "admin"].includes(profile?.role ?? "");

  const { data: companies } = await supabase.from("companies").select("id, name, slug, country, ats_type, is_active, last_collected_at").order("name");
  const ids = (companies ?? []).map((c) => c.id);
  const { data: jobs } = ids.length > 0
    ? await supabase.from("job_postings").select("company_id").eq("is_active", true)
    : { data: [] };
  const countByCompany: Record<string, number> = {};
  for (const j of jobs ?? []) {
    countByCompany[j.company_id] = (countByCompany[j.company_id] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Companies</h1>
        {canEdit && (
          <Button asChild>
            <Link href="/companies/add">Add Company</Link>
          </Button>
        )}
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>ATS</TableHead>
                <TableHead>Active Jobs</TableHead>
                <TableHead>Last Collected</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(companies ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/companies/${c.slug}`} className="font-medium hover:underline">{c.name}</Link>
                  </TableCell>
                  <TableCell>{c.country}</TableCell>
                  <TableCell>{c.ats_type}</TableCell>
                  <TableCell>{countByCompany[c.id] ?? 0}</TableCell>
                  <TableCell>{c.last_collected_at ? format(new Date(c.last_collected_at), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell>
                    <Link href={`/companies/${c.slug}`} className="text-primary text-sm hover:underline">View</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(companies ?? []).length === 0 && (
            <p className="py-8 text-center text-muted-foreground">No companies yet. {canEdit && "Add one to get started."}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
