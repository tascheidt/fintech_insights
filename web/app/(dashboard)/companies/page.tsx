import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, formatDistanceToNow } from "date-fns";
import { Building2, MapPin, Briefcase, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Maps country codes to full country names
 */
function getCountryName(code: string): string {
  const countryMap: Record<string, string> = {
    CA: "Canada",
    US: "United States",
    UK: "United Kingdom",
  };
  return countryMap[code] || code;
}

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const canEdit = ["editor", "admin"].includes(profile?.role ?? "");

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, slug, country, is_active, last_collected_at")
    .eq("is_active", true)
    .order("name");
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
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b">
                  <TableHead className="h-12 font-semibold w-[25%]">Company</TableHead>
                  <TableHead className="h-12 font-semibold w-[22%]">Location</TableHead>
                  <TableHead className="h-12 font-semibold w-[22%]">Active Jobs</TableHead>
                  <TableHead className="h-12 font-semibold w-[21%]">Last Updated</TableHead>
                  <TableHead className="h-12 font-semibold w-[10%]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(companies ?? []).map((c) => {
                  const jobCount = countByCompany[c.id] ?? 0;
                  const lastCollected = c.last_collected_at ? new Date(c.last_collected_at) : null;
                  const relativeTime = lastCollected ? formatDistanceToNow(lastCollected, { addSuffix: true }) : null;
                  
                  return (
                    <TableRow 
                      key={c.id} 
                      className="group hover:bg-muted/50 transition-colors border-b"
                    >
                      <TableCell className="py-4">
                        <Link 
                          href={`/companies/${c.slug}`}
                          className="flex items-center gap-3 hover:text-primary transition-colors"
                        >
                          <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                            <Building2 className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="font-semibold text-base">{c.name}</div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          <span className="text-sm">{getCountryName(c.country)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-2">
                          <Briefcase className="h-4 w-4 text-muted-foreground" />
                          <div className="flex items-baseline gap-1.5">
                            <span className={cn(
                              "text-lg font-bold",
                              jobCount > 0 ? "text-foreground" : "text-muted-foreground"
                            )}>
                              {jobCount}
                            </span>
                            <span className="text-xs text-muted-foreground font-normal">
                              {jobCount === 1 ? "job" : "jobs"}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        {lastCollected ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">{relativeTime}</span>
                              <span className="text-xs text-muted-foreground">
                                {format(lastCollected, "MMM d, yyyy")}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-4">
                        <Link
                          href={`/companies/${c.slug}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors group-hover:gap-1.5"
                        >
                          View
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {(companies ?? []).length === 0 && (
            <div className="py-16 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                No companies yet. {canEdit && "Add one to get started."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
