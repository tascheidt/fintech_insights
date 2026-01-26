import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/digests/[id]
 * Get a single digest with all company summaries
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch digest
  const { data: digest, error: digestError } = await supabase
    .from("weekly_digests")
    .select("*")
    .eq("id", id)
    .single();

  if (digestError || !digest) {
    return NextResponse.json({ error: "Digest not found" }, { status: 404 });
  }

  // Fetch company summaries
  const { data: companies, error: companiesError } = await supabase
    .from("weekly_digest_companies")
    .select(`
      *,
      companies!inner(id, name, slug)
    `)
    .eq("digest_id", id)
    .order("new_job_count", { ascending: false });

  if (companiesError) {
    console.error("Error fetching digest companies:", companiesError);
    return NextResponse.json({ error: companiesError.message }, { status: 500 });
  }

  return NextResponse.json({
    digest,
    companies: companies || [],
  });
}
